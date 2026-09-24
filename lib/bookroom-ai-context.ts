/**
 * BookRoom AI 上下文桥接层（Phase 3A）。
 *
 * 最高原则：书房不新造任何 AI 系统——
 *   - 角色 / 人设 / 世界书 / 用户身份：复用 character-storage + settings-storage 绑定；
 *   - API Provider / 模型 / Key：复用角色在「阅读(reading)」场景已绑定的 ApiConfig；
 *   - 记忆：复用 memory-service（核心记忆 + 长期记忆）；
 *   - 调用出口：复用 chat-engine.sendLLMRequest；
 * 书房只额外增加「当前正在一起读什么 / 看什么」这一层上下文，以及防剧透规则。
 */
import type { Book } from "./bookstore-data";
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
import { loadMemoryConfig, saveMemoryEntry } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import type { MemoryEntry } from "./memory-types";
import { sendLLMRequest } from "./chat-engine";
import type { LLMMessage } from "./llm-prompt-assembler";
import { prepareShortTermContext } from "./short-term-assembler";
import { loadReadingProgress, getOverallPercent } from "./reading-progress";
import type { CoSessionMessage } from "./bookroom-co-session";

/** 书房复用「阅读」场景的绑定（含 API / 预设 / 世界书），不新增 provider/绑定配置 */
const BOOKROOM_APP_ID = "reading";
const BOOKROOM_APP_TAGS = ["reading", "bookroom", "co-reading"];
const EXCERPT_WINDOW = 800;
const HISTORY_LIMIT = 16;

/* ───────────────────────── 当前共读内容引用 ───────────────────────── */

export type BookRoomContentRef = {
  contentId: string;
  contentType: "book" | "manga";
  title: string;
  author: string;
  /** 普通书：当前章节下标 / 标题 / 用户正读到的文本片段 */
  chapterIndex?: number;
  chapterTitle?: string;
  currentExcerpt?: string;
  /** 漫画：当前页（0 基）/ 页备注 / 总页数 */
  pageIndex?: number;
  pageCaption?: string;
  pageCount?: number;
  /** 整体阅读进度 0~100 */
  progressPercent: number;
};

/** 从统一 Book 模型 + 已持久化阅读进度，组装「当前在读内容」引用 */
export function buildBookRoomContentRef(book: Book): BookRoomContentRef {
  const progress = loadReadingProgress(book.id);
  const progressPercent = getOverallPercent(book, progress);

  if (book.type === "manga") {
    const pages = book.pages ?? [];
    const pageCount = pages.length;
    const rawIndex = progress?.chapterIndex ?? 0;
    const pageIndex = pageCount > 0 ? Math.min(Math.max(0, rawIndex), pageCount - 1) : 0;
    const page = pages[pageIndex];
    return {
      contentId: book.id,
      contentType: "manga",
      title: book.title,
      author: book.author,
      pageIndex,
      pageCaption: page?.caption?.trim() || "",
      pageCount,
      progressPercent,
    };
  }

  const chapters = book.chapters ?? [];
  const chapterCount = chapters.length;
  const rawIndex = progress?.chapterIndex ?? 0;
  const chapterIndex = chapterCount > 0 ? Math.min(Math.max(0, rawIndex), chapterCount - 1) : 0;
  const chapter = chapters[chapterIndex];
  const fullText = (chapter?.content ?? []).join("\n");
  const start = progress
    ? Math.max(0, Math.floor((progress.scrollProgress || 0) * Math.max(0, fullText.length - EXCERPT_WINDOW)))
    : 0;

  return {
    contentId: book.id,
    contentType: "book",
    title: book.title,
    author: book.author,
    chapterIndex,
    chapterTitle: chapter?.title ?? "",
    currentExcerpt: fullText.slice(start, start + EXCERPT_WINDOW),
    progressPercent,
  };
}

/* ───────────────────────── 错误类型 ───────────────────────── */

export type BookRoomAiErrorCode =
  | "no-character"   // 选中的不是真实 Float 角色（mock 兜底 / 角色卡丢失）
  | "no-config"      // 角色未绑定可用 API
  | "empty-reply"    // AI 没有返回内容
  | "aborted"        // 请求被中断
  | "failed";        // 网络 / 服务错误

export class BookRoomAiError extends Error {
  code: BookRoomAiErrorCode;
  constructor(code: BookRoomAiErrorCode, message: string) {
    super(message);
    this.name = "BookRoomAiError";
    this.code = code;
  }
}

/* ───────────────────────── 系统提示组装 ───────────────────────── */

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatWorldBookSection(worldBookIds: string[] | undefined): string {
  if (!worldBookIds || worldBookIds.length === 0) return "";
  const wanted = new Set(worldBookIds);
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
  return `<世界设定>\n${clip(lines.join("\n"), 2200)}\n</世界设定>`;
}

function formatContentSection(content: BookRoomContentRef): string {
  const head = `形式：${content.contentType === "manga" ? "一起看漫画" : "一起读（文字书）"}\n书名：《${content.title}》　作者：${content.author}`;

  if (content.contentType === "manga") {
    const position = content.pageCount
      ? `当前第 ${(content.pageIndex ?? 0) + 1} / ${content.pageCount} 页（阅读进度约 ${content.progressPercent}%）`
      : "尚未开始翻阅";
    const caption = content.pageCaption
      ? `本页备注 / 分镜信息：${content.pageCaption}`
      : "本页暂无文字信息（仅分镜画面，不要臆造台词或剧情）";
    return `<当前共看内容>\n${head}\n${position}\n${caption}\n</当前共看内容>`;
  }

  const chapter = content.chapterTitle
    ? `当前章节：第 ${(content.chapterIndex ?? 0) + 1} 章《${content.chapterTitle}》（阅读进度约 ${content.progressPercent}%）`
    : "当前章节信息暂缺";
  const excerpt = content.currentExcerpt?.trim()
    ? `用户此刻正读到的文本片段：\n"""\n${clip(content.currentExcerpt, EXCERPT_WINDOW)}\n"""`
    : "当前暂无正文片段";
  return `<当前共读内容>\n${head}\n${chapter}\n${excerpt}\n</当前共读内容>`;
}

const BEHAVIOR_RULES = `<共读规则>
1. 你就是上面设定的角色，始终保持该角色的人设、语气习惯与你和用户的关系连续性，结合已有记忆回应；不要自称 AI 助手。
2. 优先围绕用户正在读的书 / 正在看的漫画与用户的问题回应：句子、人物、情绪、节奏、分镜都可以聊，也可以轻轻联系你们的共同记忆。
3. 【防剧透·严格】你只能使用「当前共读/共看内容」中进度以内的信息，以及用户本人已经告诉你的内容；绝不主动透露用户尚未读到的后续章节、后续页面的情节。被追问后续时，温柔点到为止或提醒「看到那里你就知道了」。
4. 片段里没有、你确实不知道的信息，不要假装知道，不要编造书中不存在的事实；漫画当前页没有文字信息时，不要替画面虚构台词。
5. 只在用户主动发言、点击「问 TA」或「陪伴反馈」时回应；不要抢话，不要每翻一页就主动说话。
6. 语气自然、安静、克制、有陪伴感，通常 2~5 句即可；少用表情符号，不油腻、不喊口号。
7. 当用户明确要求你记住某事时，自然答应一句即可（系统会另行长期记录），不必复述规则。</共读规则>`;

function buildSystemPrompt(params: {
  characterName: string;
  persona: string;
  personality: string;
  userBlock: string;
  worldBookBlock: string;
  coreMemoriesBlock: string;
  longTermMemoriesBlock: string;
  recentBlock: string;
  content: BookRoomContentRef;
}): string {
  const { characterName, persona, personality, userBlock, worldBookBlock, coreMemoriesBlock, longTermMemoriesBlock, recentBlock, content } = params;
  return [
    `你正在 Float 的「书房」里，与用户进行一对一的${content.contentType === "manga" ? "共同看漫画" : "共同阅读"}。`,
    `<角色设定>\n你是 ${characterName}。\n${persona}${personality ? `\n性格补充：${personality}` : ""}\n</角色设定>`,
    userBlock,
    worldBookBlock,
    coreMemoriesBlock,
    longTermMemoriesBlock,
    recentBlock ? `<最近的相处片段>\n${recentBlock}\n</最近的相处片段>` : "",
    formatContentSection(content),
    BEHAVIOR_RULES,
  ].filter(Boolean).join("\n\n");
}

/* ───────────────────────── 对外：生成一条共读回复 ───────────────────────── */

export type GenerateBookRoomReplyInput = {
  roleId: string;
  content: BookRoomContentRef;
  /** 本次共读已有对话（不含本轮用户新消息） */
  history: CoSessionMessage[];
  userText: string;
  signal?: AbortSignal;
};

/** 解析当前角色在「阅读」场景绑定的真实 AI 配置（共读 / 翻译共用），不新建 provider */
function resolveRoleAiSlot(roleId: string) {
  const character = loadCharacters().find(item => item.id === roleId);
  if (!character) {
    throw new BookRoomAiError("no-character", "先选择一位陪读角色");
  }
  const slot = resolveBinding(loadBindingConfig(), roleId, BOOKROOM_APP_ID);
  const apiConfig = slot.apiConfigId
    ? (loadApiConfigs().find(item => item.id === slot.apiConfigId) ?? null)
    : null;
  if (!apiConfig) {
    throw new BookRoomAiError("no-config", "AI 还没有配置好，请先在设置中为该角色绑定 API");
  }
  const presets = loadPresets();
  const preset = (slot.presetId ? presets.find(item => item.id === slot.presetId) ?? null : null)
    ?? presets.find(item => item.builtIn)
    ?? presets[0]
    ?? null;
  const regexes = (slot.regexIds ?? [])
    .map(id => loadRegexes().find(item => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { character, apiConfig, preset, regexes, worldBookIds: slot.worldBookIds };
}

/**
 * 阅读器划词翻译：复用当前角色已绑定的 Float AI，专用翻译 prompt。
 * 中文 → 英文；其他语言 → 简体中文。只返回译文，不改正文、不写任何记忆。
 */
export async function translateBookRoomText(
  roleId: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ translation: string; targetLanguage: string }> {
  const source = text.trim();
  if (!source) throw new BookRoomAiError("failed", "没有可翻译的文字");
  const { character, apiConfig, preset, regexes } = resolveRoleAiSlot(roleId);

  const cjkCount = (source.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const toEnglish = cjkCount / Math.max(1, source.replace(/\s/g, "").length) > 0.3;
  const targetLanguage = toEnglish ? "英文" : "简体中文";

  const system = [
    `你是 ${character.name}，正在书房陪用户读书，兼任翻译。`,
    `把用户给出的文字准确翻译成${targetLanguage}：保留原意、语气与原文的断句节奏；`,
    "诗歌/对白保持文学感，不要添加解释、注释或任何原文与译文以外的内容。",
    `直接输出${targetLanguage}译文本身。`,
  ].join("\n");

  let raw: string;
  try {
    raw = await sendLLMRequest(
      apiConfig,
      preset,
      [
        { role: "system", content: system },
        { role: "user", content: source },
      ],
      regexes,
      { characterName: character.name, userName: "用户" },
      { appId: BOOKROOM_APP_ID, appTags: [...BOOKROOM_APP_TAGS, "translate"], signal, skipOutputRegex: false },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new BookRoomAiError("aborted", "已取消");
    throw new BookRoomAiError("failed", (error as Error)?.message || "翻译失败，稍后再试。");
  }
  const translation = raw.trim();
  if (!translation) throw new BookRoomAiError("empty-reply", "翻译失败，稍后再试。");
  return { translation, targetLanguage };
}

export async function generateBookRoomReply(input: GenerateBookRoomReplyInput): Promise<{ reply: string; characterName: string }> {
  const { roleId, content, history, userText, signal } = input;

  const { character, apiConfig, preset, regexes, worldBookIds } = resolveRoleAiSlot(roleId);
  const userIdentity = resolveUserIdentity(roleId, BOOKROOM_APP_ID);

  const memConfig = loadMemoryConfig();
  const memoryQuery = [content.title, content.currentExcerpt ?? "", content.pageCaption ?? "", userText]
    .join("\n")
    .slice(0, 1000);
  const [coreEntries, longTermEntries] = await Promise.all([
    retrieveCoreMemoriesForPrompt(roleId, memConfig).catch(() => []),
    retrieveMemoriesForPrompt(roleId, memoryQuery, memConfig).catch(() => []),
  ]);

  const userBlock = userIdentity
    ? `<用户>\n- 称呼：${userIdentity.name}${userIdentity.gender && userIdentity.gender !== "保密" ? `\n- 性别：${userIdentity.gender}` : ""}${userIdentity.occupation ? `\n- 职业：${userIdentity.occupation}` : ""}${userIdentity.bio ? `\n- 简介：${userIdentity.bio}` : ""}\n</用户>`
    : "";
  const coreText = formatCoreMemories(coreEntries);
  const longTermText = formatLongTermMemories(longTermEntries);

  // 短期：统一时间线（聊天 / 日记 / 共同经历等各 App 近期事件），复用现有组装器并容错
  let recentBlockText = "";
  try {
    const { recentBlocks } = prepareShortTermContext(roleId, BOOKROOM_APP_ID, {
      userName: userIdentity?.name ?? "用户",
    });
    recentBlockText = clip(
      recentBlocks.map(block => block.content).filter(Boolean).join("\n"),
      1500,
    );
  } catch {
    recentBlockText = "";
  }

  const systemPrompt = buildSystemPrompt({
    characterName: character.name,
    persona: character.persona?.trim() || "（暂无详细人设，请自然地扮演该角色）",
    personality: character.personality?.trim() ?? "",
    userBlock,
    worldBookBlock: formatWorldBookSection(worldBookIds),
    coreMemoriesBlock: coreText ? `<核心记忆>\n${clip(coreText, 1800)}\n</核心记忆>` : "",
    longTermMemoriesBlock: longTermText ? `<你与用户的过往记忆>\n${clip(longTermText, 2200)}\n</你与用户的过往记忆>` : "",
    recentBlock: recentBlockText,
    content,
  });

  const historyMessages: LLMMessage[] = history
    .filter(message => message.role === "user" || message.role === "assistant")
    .slice(-HISTORY_LIMIT)
    .map(message => ({ role: message.role, content: message.content }));

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: userText },
  ];

  let raw: string;
  try {
    raw = await sendLLMRequest(
      apiConfig,
      preset,
      messages,
      regexes,
      { characterName: character.name, userName: userIdentity?.name ?? "用户" },
      { appId: BOOKROOM_APP_ID, appTags: BOOKROOM_APP_TAGS, signal, skipOutputRegex: false },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || signal?.aborted) {
      throw new BookRoomAiError("aborted", "已取消");
    }
    throw new BookRoomAiError("failed", (error as Error)?.message || "AI 暂时没有回应，稍后再试。");
  }

  const reply = raw.trim();
  if (!reply) {
    throw new BookRoomAiError("empty-reply", "AI 暂时没有回应，稍后再试。");
  }
  return { reply, characterName: character.name };
}

/* ───────────────────────── 本地开场白（不调用 AI） ───────────────────────── */

/** 打开共读层时的本地欢迎语（非 AI 请求，避免每次打开/翻页都打 AI） */
export function buildBookRoomGreeting(characterName: string, content: BookRoomContentRef): string {
  if (content.contentType === "manga") {
    const where = content.pageCount
      ? `我们在第 ${(content.pageIndex ?? 0) + 1} 页`
      : "我们慢慢翻";
    return `我在。一起看《${content.title}》，${where}。看到想停下来说两句的分镜，就告诉我。`;
  }
  const chapter = content.chapterTitle ? `，我陪你停在《${content.chapterTitle}》` : "";
  return `我在。今晚一起读《${content.title}》${chapter}。读到想停下来的句子，就发给我。`;
}

/* ───────────────────────── 长期记忆写回（选择性） ───────────────────────── */

export type BookRoomMemoryKind = "explicit-remember" | "strong-like" | "strong-dislike" | "milestone";

export type NotableEvent = {
  kind: BookRoomMemoryKind;
  importance: number;
  summary: string;
};

const REMEMBER_RE = /(帮我记住|请记住|给我记住|你要记得|要记得|别忘了|别忘记|记一下|记住[了啦呀啊哦哇呐呢]?[：:，,\s]?)/;
const LIKE_RE = /(特别喜欢|超喜欢|好喜欢|太喜欢|最喜欢|超爱|好爱|爱死了|太戳我|好戳我|戳中我|狠狠共鸣)/;
const DISLIKE_RE = /(特别讨厌|很讨厌|好讨厌|最讨厌|真的讨厌|受不了|完全看不下去)/;

/**
 * 判断一条用户发言是否「值得写入长期记忆」。
 * 宁严勿滥：普通寒暄/普通讨论不写；仅显式要求记住、强烈好恶才写。
 */
export function detectNotableBookroomEvent(
  userText: string,
  content: BookRoomContentRef,
): NotableEvent | null {
  const text = userText.trim();
  if (text.length < 4) return null;
  const place = content.contentType === "manga"
    ? `第 ${(content.pageIndex ?? 0) + 1} 页附近`
    : content.chapterTitle ? `《${content.chapterTitle}》` : "阅读时";

  if (REMEMBER_RE.test(text)) {
    const payload = text.replace(REMEMBER_RE, "").replace(/^[：:，,\s"“”']+|[。！!？?\s"“”']+$/g, "").trim();
    return {
      kind: "explicit-remember",
      importance: 0.85,
      summary: `[书房共读] 用户在共读《${content.title}》时明确要求角色记住：${payload || text}`,
    };
  }
  if (LIKE_RE.test(text)) {
    return {
      kind: "strong-like",
      importance: 0.6,
      summary: `[书房共读] 用户在《${content.title}》${place}表达了强烈喜欢：${text.slice(0, 80)}`,
    };
  }
  if (DISLIKE_RE.test(text)) {
    return {
      kind: "strong-dislike",
      importance: 0.55,
      summary: `[书房共读] 用户在《${content.title}》${place}表达了明显反感：${text.slice(0, 80)}`,
    };
  }
  return null;
}

/** 读完章节 / 看完一话等里程碑事件（供阅读器完成点接入，本阶段仅提供能力） */
export function buildBookroomMilestoneSummary(content: BookRoomContentRef): string {
  return content.contentType === "manga"
    ? `[书房共读] 用户和角色一起看完了漫画《${content.title}》。`
    : `[书房共读] 用户和角色一起读完了《${content.title}》${content.chapterTitle ? `的《${content.chapterTitle}》` : "的一个章节"}。`;
}

export type RecordBookroomMemoryInput = {
  roleId: string;
  content: BookRoomContentRef;
  kind: BookRoomMemoryKind;
  summary: string;
  importance: number;
  /** 关联的共读会话，便于日后按会话恢复上下文 */
  sessionId?: string;
};

/**
 * 把值得保留的共读事件写入 Float 现有长期记忆（IndexedDB）。
 * sourceApp 复用 "reading"，metadata.source = "bookroom"，不新建记忆系统。
 */
export async function recordBookroomMemoryEvent(input: RecordBookroomMemoryInput): Promise<void> {
  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: `brm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    characterId: input.roleId,
    sourceApp: "reading",
    type: "long_term",
    content: input.summary,
    importance: input.importance,
    createdAt: now,
    updatedAt: now,
    metadata: {
      source: "bookroom",
      kind: input.kind,
      contentId: input.content.contentId,
      contentType: input.content.contentType,
      title: input.content.title,
      chapterIndex: input.content.chapterIndex,
      pageIndex: input.content.pageIndex,
      roleId: input.roleId,
      sessionId: input.sessionId,
    },
  };
  await saveMemoryEntry(entry);
}
