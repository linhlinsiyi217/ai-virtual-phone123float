/**
 * 书房「AI 写书」上下文桥接层（Phase 6A）。
 *
 * 原则：
 * - 不新建 AI 系统，复用 Float 现有 sendLLMRequest、角色卡、绑定、记忆、世界书；
 * - 角色只存 roleId，每次生成实时 resolve canonical 最新版；
 * - 可选角色（无角色时走全局默认 API）；
 * - 记忆只读不写，小说内容绝不自动进入长期记忆；
 * - 上下文带 token/长度预算，避免无限膨胀。
 */
import type { Character } from "./character-types";
import { loadCharacters } from "./character-storage";
import {
  resolveBinding,
  loadBindingConfig,
  loadApiConfigs,
  loadPresets,
  loadWorldBooks,
  loadRegexes,
  resolveUserIdentity,
} from "./settings-storage";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { sendLLMRequest } from "./chat-engine";
import type { LLMMessage } from "./llm-prompt-assembler";
import { prepareShortTermContext } from "./short-term-assembler";
import type { MemoryEntry } from "./memory-types";
import { loadCharacterWorldGroups, type CharacterWorldGroup } from "./character-world-storage";
import {
  getWritingProject,
  loadChapterDoc,
  type WritingProject,
  type WritingChapterMeta,
  type WritingOutlineItem,
} from "./bookroom-writing";

const BOOKROOM_APP_ID = "reading";
const BOOKROOM_APP_TAGS = ["reading", "bookroom", "writing"];

/* ───────────────────────── 错误类型 ───────────────────────── */

export type WritingAiErrorCode =
  | "no-project"
  | "no-chapter"
  | "no-config"
  | "empty-reply"
  | "aborted"
  | "failed";

export class WritingAiError extends Error {
  code: WritingAiErrorCode;
  constructor(code: WritingAiErrorCode, message: string) {
    super(message);
    this.name = "WritingAiError";
    this.code = code;
  }
}

/* ───────────────────────── 写作动作 ───────────────────────── */

export type WritingAction =
  | "synopsis"          // 生成简介
  | "outline"           // 生成大纲
  | "chapter-title"     // 生成章节标题
  | "write"             // 写这一章
  | "continue"          // 继续写
  | "expand"            // 扩写
  | "condense"          // 缩写
  | "rewrite"           // 改写
  | "polish"            // 润色
  | "tone"              // 改语气
  | "pov"               // 改视角
  | "pace"              // 改节奏
  | "detail"            // 补细节
  | "dialogue"          // 生成对话
  | "environment"       // 生成环境描写
  | "summary"           // 总结本章
  | "quickstart";       // 快速开始（一句话→简介+大纲+第一章建议）

export type WritingGenerationInput = {
  projectId: string;
  chapterId?: string;
  action: WritingAction;
  /** 用户当前指令 / 选中文字 / 补充说明 */
  instruction?: string;
  signal?: AbortSignal;
};

/* ───────────────────────── 工具函数 ───────────────────────── */

function clip(text: string, maxChars: number): string {
  const t = text.trim();
  return t.length > maxChars ? t.slice(0, maxChars) + "…" : t;
}

function clipLines(lines: string[], maxChars: number): string {
  let acc = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (acc + line.length > maxChars) {
      const remain = maxChars - acc;
      if (remain > 10) out.push(line.slice(0, remain) + "…");
      break;
    }
    out.push(line);
    acc += line.length + 1;
  }
  return out.join("\n");
}

function resolveRoleAiSlot(roleId?: string) {
  const config = loadBindingConfig();
  const slot = resolveBinding(config, roleId || undefined, BOOKROOM_APP_ID);
  const apiConfig = slot.apiConfigId
    ? (loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? null)
    : null;
  if (!apiConfig) {
    throw new WritingAiError("no-config", roleId ? "该角色未绑定可用 API，请先在设置中绑定" : "AI 还没有配置好，请先在全局设置中绑定 API");
  }
  const presets = loadPresets();
  const preset = (slot.presetId ? presets.find(p => p.id === slot.presetId) ?? null : null)
    ?? presets.find(p => p.builtIn)
    ?? presets[0]
    ?? null;
  const regexes = (slot.regexIds ?? [])
    .map(id => loadRegexes().find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  return { slot, apiConfig, preset, regexes };
}

function resolvePrimaryRole(project: WritingProject): Character | null {
  const firstRoleId = project.roleIds[0];
  if (!firstRoleId) return null;
  return loadCharacters().find(c => c.id === firstRoleId) ?? null;
}

/* ───────────────────────── 上下文各部分组装（带预算） ───────────────────────── */

const BUDGET = {
  chapterSummaryEach: 200,
  chapterSummaryMaxCount: 10,
  memories: 1500,      // token budget（memory-service 内部处理）
  worldBook: 2000,     // chars
  materials: 1500,     // chars
  prevTail: 1200,      // chars
  outline: 1600,       // chars
  synopsis: 600,       // chars
  shortTerm: 1200,     // chars
};

function buildProjectHeader(project: WritingProject): string {
  const parts: string[] = [
    `作品：《${project.title}》`,
    project.subtitle ? `副标题：${project.subtitle}` : "",
    project.genre?.length ? `类型：${project.genre.join(" / ")}` : "",
    project.tone?.length ? `气质：${project.tone.join(" / ")}` : "",
    project.pov ? `视角：${project.pov}` : "",
    project.tense ? `时态：${project.tense}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function buildSynopsisBlock(project: WritingProject): string {
  if (!project.synopsis?.trim()) return "";
  return `<故事简介>\n${clip(project.synopsis.trim(), BUDGET.synopsis)}\n</故事简介>`;
}

function buildOutlineBlock(project: WritingProject, currentChapterId?: string): string {
  if (project.outline.length === 0) return "";
  const lines: string[] = [];
  let acc = 0;
  for (const item of project.outline) {
    const doneMark = item.done ? " [已完成]" : "";
    const line = `- ${item.title}${doneMark}${item.summary ? "：" + item.summary : ""}`;
    if (acc + line.length > BUDGET.outline) break;
    lines.push(line);
    acc += line.length + 1;
    if (item.beats) {
      for (const beat of item.beats) {
        const bline = `  · ${beat.title}${beat.done ? " [完成]" : ""}`;
        if (acc + bline.length > BUDGET.outline) break;
        lines.push(bline);
        acc += bline.length + 1;
      }
    }
  }
  return lines.length ? `<大纲>\n${lines.join("\n")}\n</大纲>` : "";
}

function buildCompletedChaptersSummary(project: WritingProject, currentChapterId?: string): string {
  const completed = project.chapters
    .filter(c => c.status === "finished" && c.id !== currentChapterId)
    .sort((a, b) => a.order - b.order)
    .slice(-BUDGET.chapterSummaryMaxCount);
  if (completed.length === 0) return "";
  const lines = completed.map(c => {
    const sum = c.summary?.trim() || c.title;
    return `- 《${c.title}》：${clip(sum, BUDGET.chapterSummaryEach)}`;
  });
  return `<已完成章节摘要>\n${lines.join("\n")}\n</已完成章节摘要>`;
}

function buildPreviousChapterTail(project: WritingProject, currentChapterId?: string): string {
  if (!currentChapterId) return "";
  const current = project.chapters.find(c => c.id === currentChapterId);
  if (!current || current.order <= 0) return "";
  const prev = project.chapters
    .filter(c => c.order < current.order && c.status !== "planned")
    .sort((a, b) => b.order - a.order)[0];
  if (!prev) return "";
  const doc = loadChapterDoc(project.id, prev.id);
  if (!doc.content.trim()) return "";
  const tail = clip(doc.content.trim().slice(-BUDGET.prevTail), BUDGET.prevTail);
  return `<前一章结尾>\n《${prev.title}》结尾片段：\n${tail}\n</前一章结尾>`;
}

function buildCurrentChapterBlock(project: WritingProject, chapterId?: string): string {
  if (!chapterId) return "";
  const meta = project.chapters.find(c => c.id === chapterId);
  if (!meta) return "";
  const doc = loadChapterDoc(project.id, chapterId);
  const head = `当前章节：《${meta.title}》${meta.status === "planned" ? "（尚未动笔）" : ""}`;
  const existing = doc.content.trim()
    ? `\n已写正文：\n${clip(doc.content.trim(), 2400)}`
    : "";
  return `<当前章节>\n${head}${existing}\n</当前章节>`;
}

function buildRoleBlock(project: WritingProject): string {
  const role = resolvePrimaryRole(project);
  if (!role) return "";
  const parts: string[] = [
    `角色名：${role.name}`,
    role.persona?.trim() ? `人设：${role.persona.trim()}` : "",
    role.personality?.trim() ? `性格：${role.personality.trim()}` : "",
  ];
  return `<角色设定>\n${parts.filter(Boolean).join("\n")}\n</角色设定>`;
}

function buildUserBlock(project: WritingProject): string {
  if (!project.userAsCharacter) return "";
  const role = resolvePrimaryRole(project);
  const identity = resolveUserIdentity(role?.id, BOOKROOM_APP_ID);
  if (!identity) return "";
  const parts: string[] = [
    `称呼：${identity.name}`,
    identity.gender && identity.gender !== "保密" ? `性别：${identity.gender}` : "",
    identity.occupation ? `职业：${identity.occupation}` : "",
    identity.bio ? `简介：${identity.bio}` : "",
  ];
  return `<用户角色>\n${parts.filter(Boolean).join("\n")}\n</用户角色>`;
}

function buildWorldBookBlock(project: WritingProject): string {
  if (!project.sourceContext.includeWorldbook) return "";
  const wanted = new Set(project.lorebookIds ?? []);
  if (wanted.size === 0) return "";
  const lines: string[] = [];
  for (const wb of loadWorldBooks()) {
    if (!wanted.has(wb.id)) continue;
    for (const entry of wb.entries ?? []) {
      if (entry.disable || !entry.content.trim()) continue;
      const label = entry.key?.trim() || "设定";
      lines.push(`- 【${label}】${entry.content.trim()}`);
    }
  }
  if (lines.length === 0) return "";
  return `<世界书>\n${clip(lines.join("\n"), BUDGET.worldBook)}\n</世界书>`;
}

function buildWorldArchiveBlock(project: WritingProject): string {
  if (!project.worldArchiveId) return "";
  const group = loadCharacterWorldGroups().find(g => g.id === project.worldArchiveId);
  if (!group) return "";
  const members = loadCharacters().filter(c => group.memberIds.includes(c.id));
  const memberLines = members.map(c => `- ${c.name}`);
  const relationLines = group.relations.map(r => {
    const from = members.find(c => c.id === r.fromCharacterId)?.name || "?";
    const to = members.find(c => c.id === r.toCharacterId)?.name || "?";
    return `- ${from} → ${to}：${r.label}`;
  });
  const parts = [
    `世界卷宗：${group.name}`,
    group.description ? group.description : "",
    memberLines.length ? `成员：\n${memberLines.join("\n")}` : "",
    relationLines.length ? `关系：\n${relationLines.join("\n")}` : "",
  ];
  return `<世界卷宗>\n${parts.filter(Boolean).join("\n")}\n</世界卷宗>`;
}

function buildMaterialsBlock(project: WritingProject): string {
  if (project.materials.length === 0) return "";
  const lines = project.materials.map(m => `- ${m.text.trim()}`);
  return `<故事素材 / 共同经历>\n${clip(lines.join("\n"), BUDGET.materials)}\n</故事素材 / 共同经历>`;
}

function buildInstructionsBlock(project: WritingProject): string {
  if (!project.instructions?.trim()) return "";
  return `<写作要求>\n${project.instructions.trim()}\n</写作要求>`;
}

/* ───────────────────────── 记忆上下文（只读） ───────────────────────── */

async function buildMemoryBlocks(project: WritingProject): Promise<{ core: string; longTerm: string; recent: string }> {
  const role = resolvePrimaryRole(project);
  if (!role || !project.sourceContext.includeRelationshipMemory) {
    return { core: "", longTerm: "", recent: "" };
  }

  const memConfig = loadMemoryConfig();
  let coreEntries: MemoryEntry[] = [];
  let longTermEntries: MemoryEntry[] = [];

  if (project.sourceContext.includeLongTermMemory) {
    [coreEntries, longTermEntries] = await Promise.all([
      retrieveCoreMemoriesForPrompt(role.id, memConfig).catch(() => [] as MemoryEntry[]),
      retrieveMemoriesForPrompt(role.id, project.title, memConfig).catch(() => [] as MemoryEntry[]),
    ]);
  }

  const coreText = formatCoreMemories(coreEntries);
  const longTermText = formatLongTermMemories(longTermEntries);

  let recentBlockText = "";
  if (project.sourceContext.includeRecentMemory) {
    try {
      const { recentBlocks } = prepareShortTermContext(role.id, BOOKROOM_APP_ID, {
        userName: resolveUserIdentity(role.id, BOOKROOM_APP_ID)?.name ?? "用户",
      });
      recentBlockText = clip(
        recentBlocks.map(b => b.content).filter(Boolean).join("\n"),
        BUDGET.shortTerm,
      );
    } catch {
      recentBlockText = "";
    }
  }

  return {
    core: coreText ? `<核心记忆>\n${clip(coreText, 1800)}\n</核心记忆>` : "",
    longTerm: longTermText ? `<长期记忆>\n${clip(longTermText, 2200)}\n</长期记忆>` : "",
    recent: recentBlockText ? `<近期相处片段>\n${recentBlockText}\n</近期相处片段>` : "",
  };
}

/* ───────────────────────── Prompt 映射 ───────────────────────── */

function actionToPrompt(action: WritingAction, instruction?: string): string {
  const instr = instruction?.trim();
  const base: Record<WritingAction, string> = {
    synopsis: "请根据已有信息，为这部作品写一段精炼的故事简介（200-400字）。不要剧透后续未写内容，聚焦整体氛围与核心冲突。",
    outline: "请为这部作品生成一份完整大纲。格式要求：\n- 每行一个章节：章节标题｜一句话剧情概要\n- 只输出大纲本身，不添加额外解释。",
    "chapter-title": "请为当前章节生成一个贴切、有文学感的标题。只输出标题本身，不解释。",
    write: `请为当前章节撰写正文。保持作品设定中的风格与气质。${instr ? "\n用户特别要求：" + instr : ""}`,
    continue: `请继续写当前章节，从已有正文之后自然地接下去。保持原有节奏与语气。${instr ? "\n用户特别要求：" + instr : ""}`,
    expand: `请对以下段落进行扩写，丰富细节、情绪与画面感，但不要改变原意和核心情节。\n段落：${instr || "（用户未指定段落，请扩写当前章节已有正文）"}`,
    condense: `请对以下段落进行缩写，保留核心信息与关键情节，去除冗余描写。\n段落：${instr || "（用户未指定段落，请缩写当前章节已有正文）"}`,
    rewrite: `请改写以下段落，使其表达更精准、更具文学感，但不要改变原意。\n段落：${instr || "（用户未指定段落，请改写当前章节已有正文）"}`,
    polish: `请润色以下段落，提升语言质感，修正不通顺之处，保持原有风格。\n段落：${instr || "（用户未指定段落，请润色当前章节已有正文）"}`,
    tone: `请调整以下段落的语气。${instr ? "目标语气：" + instr : "请让语气更统一、更贴合作品气质。"}`,
    pov: `请调整以下段落的叙述视角。${instr ? "目标视角：" + instr : "请保持视角一致。"}`,
    pace: `请调整以下段落的叙事节奏。${instr ? "目标节奏：" + instr : "请让节奏更贴合当前情节需要。"}`,
    detail: `请为以下段落补充细节描写（环境、神态、动作、心理等），使画面更饱满。\n段落：${instr || "（用户未指定段落，请补充当前章节细节）"}`,
    dialogue: `请为当前场景生成一段对话。要求：\n- 符合角色人设与关系\n- 自然、有张力，不要 exposition dump\n- 只输出对话本身及必要动作神态描写\n${instr ? "用户要求：" + instr : ""}`,
    environment: `请为当前章节写一段环境描写，烘托氛围，与情节情绪呼应。${instr ? "\n用户要求：" + instr : ""}`,
    summary: "请总结当前章节已写内容，提炼核心情节、情绪转折与关键信息（200字以内）。",
    quickstart: `用户只给了一句话灵感，请据此：\n1. 写一段故事简介\n2. 生成一份大纲（每行：章节标题｜一句话概要）\n3. 给出第一章的简要写作建议\n\n用户灵感：${instr || "（未提供）"}`,
  };
  return base[action] ?? (instr || "请继续写作。");
}

/* ───────────────────────── 对外：组装上下文 ───────────────────────── */

export type WritingContextResult = {
  systemPrompt: string;
  userPrompt: string;
  roleName: string | null;
};

export async function buildWritingContext(
  projectId: string,
  chapterId?: string,
  action?: WritingAction,
  instruction?: string,
): Promise<WritingContextResult> {
  const project = getWritingProject(projectId);
  if (!project) throw new WritingAiError("no-project", "作品不存在");
  if (chapterId && !project.chapters.find(c => c.id === chapterId)) {
    throw new WritingAiError("no-chapter", "章节不存在");
  }

  const role = resolvePrimaryRole(project);
  const memBlocks = await buildMemoryBlocks(project);

  const sections = [
    buildProjectHeader(project),
    buildSynopsisBlock(project),
    buildOutlineBlock(project, chapterId),
    buildCompletedChaptersSummary(project, chapterId),
    buildPreviousChapterTail(project, chapterId),
    buildCurrentChapterBlock(project, chapterId),
    buildRoleBlock(project),
    buildUserBlock(project),
    buildWorldArchiveBlock(project),
    buildWorldBookBlock(project),
    buildMaterialsBlock(project),
    memBlocks.core,
    memBlocks.longTerm,
    memBlocks.recent,
    buildInstructionsBlock(project),
  ].filter(Boolean);

  const systemPrompt = [
    "你是一位专业小说写作助手，正在 Float「书房」的「书桌」中协助用户完成一部作品。",
    "请严格遵循以下原则：",
    "1. 不随意改变角色核心人格；不捏造角色不知道的信息；不把世界书之外内容当成既定事实。",
    "2. 不覆盖用户明确设定；不擅自改变角色关系；不把虚构素材写回真实长期记忆。",
    "3. 仅使用当前作品已有设定和已写内容作为依据，不提前剧透未写部分。",
    "4. 输出纯文本，不要加 markdown 代码块包裹。",
    sections.join("\n\n"),
  ].join("\n\n");

  const userPrompt = action ? actionToPrompt(action, instruction) : (instruction || "请继续写作。");

  return {
    systemPrompt,
    userPrompt,
    roleName: role?.name ?? null,
  };
}

/* ───────────────────────── 对外：调用 AI 生成 ───────────────────────── */

export type WritingGenerationResult = {
  text: string;
  roleName: string | null;
};

export async function generateWriting(input: WritingGenerationInput): Promise<WritingGenerationResult> {
  const { projectId, chapterId, action, instruction, signal } = input;

  const project = getWritingProject(projectId);
  if (!project) throw new WritingAiError("no-project", "作品不存在");

  const role = resolvePrimaryRole(project);
  const { apiConfig, preset, regexes } = resolveRoleAiSlot(role?.id);

  const ctx = await buildWritingContext(projectId, chapterId, action, instruction);

  const messages: LLMMessage[] = [
    { role: "system", content: ctx.systemPrompt },
    { role: "user", content: ctx.userPrompt },
  ];

  let raw: string;
  try {
    raw = await sendLLMRequest(
      apiConfig,
      preset,
      messages,
      regexes,
      { characterName: role?.name ?? "写作助手", userName: "用户" },
      { appId: BOOKROOM_APP_ID, appTags: BOOKROOM_APP_TAGS, signal, skipOutputRegex: false },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || signal?.aborted) {
      throw new WritingAiError("aborted", "已取消");
    }
    throw new WritingAiError("failed", (error as Error)?.message || "AI 暂时没有回应，稍后再试。");
  }

  const text = raw.trim();
  if (!text) {
    throw new WritingAiError("empty-reply", "AI 返回了空内容，请重试。");
  }

  return { text, roleName: ctx.roleName };
}

/* ───────────────────────── 快捷 API ───────────────────────── */

/** 快速开始：一句话灵感 → 简介 + 大纲 + 第一章建议（两次独立调用） */
export async function quickstartWriting(
  projectId: string,
  idea: string,
  signal?: AbortSignal,
): Promise<{ synopsis: string; outline: WritingOutlineItem[]; suggestion: string }> {
  const project = getWritingProject(projectId);
  if (!project) throw new WritingAiError("no-project", "作品不存在");

  // 第一次调用：简介
  const synopsisCtx = await buildWritingContext(projectId, undefined, "synopsis", idea);
  const { apiConfig, preset, regexes } = resolveRoleAiSlot(resolvePrimaryRole(project)?.id);

  let synopsisRaw: string;
  try {
    synopsisRaw = await sendLLMRequest(
      apiConfig,
      preset,
      [
        { role: "system", content: synopsisCtx.systemPrompt },
        { role: "user", content: `用户灵感：${idea}\n\n请根据这个灵感写一段故事简介（200-400字）。不要剧透，聚焦氛围与核心冲突。` },
      ],
      regexes,
      { characterName: resolvePrimaryRole(project)?.name ?? "写作助手", userName: "用户" },
      { appId: BOOKROOM_APP_ID, appTags: [...BOOKROOM_APP_TAGS, "quickstart"], signal, skipOutputRegex: false },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || signal?.aborted) throw new WritingAiError("aborted", "已取消");
    throw new WritingAiError("failed", (error as Error)?.message || "简介生成失败");
  }
  const synopsis = synopsisRaw.trim();

  // 第二次调用：大纲
  const outlineCtx = await buildWritingContext(projectId, undefined, "outline", idea);
  let outlineRaw: string;
  try {
    outlineRaw = await sendLLMRequest(
      apiConfig,
      preset,
      [
        { role: "system", content: outlineCtx.systemPrompt + "\n\n已生成简介：\n" + synopsis },
        { role: "user", content: `请为这部作品生成大纲。每行格式：章节标题｜一句话概要。只输出大纲本身。` },
      ],
      regexes,
      { characterName: resolvePrimaryRole(project)?.name ?? "写作助手", userName: "用户" },
      { appId: BOOKROOM_APP_ID, appTags: [...BOOKROOM_APP_TAGS, "quickstart"], signal, skipOutputRegex: false },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || signal?.aborted) throw new WritingAiError("aborted", "已取消");
    throw new WritingAiError("failed", (error as Error)?.message || "大纲生成失败");
  }

  // 解析大纲：章节标题｜一句话概要
  const outline: WritingOutlineItem[] = [];
  for (const line of outlineRaw.trim().split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const parts = trimmed.split(/[｜|]/);
    const title = parts[0]?.trim();
    const summary = parts[1]?.trim();
    if (title) {
      outline.push({
        id: `outline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${outline.length}`,
        title,
        summary,
      });
    }
  }

  // 第三次调用：第一章建议
  let suggestion = "";
  try {
    const sugCtx = await buildWritingContext(projectId, undefined, undefined, idea);
    const sugRaw = await sendLLMRequest(
      apiConfig,
      preset,
      [
        { role: "system", content: sugCtx.systemPrompt + "\n\n已生成简介：\n" + synopsis + "\n\n已生成大纲：\n" + outline.map((o, i) => `${i + 1}. ${o.title}`).join("\n") },
        { role: "user", content: "请给出第一章的简要写作建议（开头如何切入、情绪基调、需要注意的设定等，150字以内）。" },
      ],
      regexes,
      { characterName: resolvePrimaryRole(project)?.name ?? "写作助手", userName: "用户" },
      { appId: BOOKROOM_APP_ID, appTags: [...BOOKROOM_APP_TAGS, "quickstart"], signal, skipOutputRegex: false },
    );
    suggestion = sugRaw.trim();
  } catch {
    suggestion = "";
  }

  return { synopsis, outline, suggestion };
}

/** 解析大纲文本为 WritingOutlineItem 数组 */
export function parseWritingOutline(text: string): WritingOutlineItem[] {
  const outline: WritingOutlineItem[] = [];
  for (const line of text.trim().split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // 支持 "- 标题｜概要" 或 "标题｜概要" 或 "1. 标题｜概要"
    const cleaned = trimmed.replace(/^[-\d.\s]+/, "");
    const parts = cleaned.split(/[｜|]/);
    const title = parts[0]?.trim();
    const summary = parts[1]?.trim();
    if (title) {
      outline.push({
        id: `outline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${outline.length}`,
        title,
        summary,
      });
    }
  }
  return outline;
}
