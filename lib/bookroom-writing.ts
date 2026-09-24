/**
 * 书房「书桌 / AI 写书」— WritingProject 数据层（Phase 6A）。
 *
 * 原则：
 *   - WritingProject 是独立写作工程模型，不是聊天记录；
 *   - 角色只保存 roleId 引用，生成时实时解析 canonical 角色卡（Phase 5B 真源原则）；
 *   - 章节正文与项目 meta 分键存储，避免单 key 过大；
 *   - AI 改写前自动保存版本快照，支持回退，绝不覆盖丢失用户原文；
 *   - 小说内容绝不自动写入长期记忆；
 *   - 项目 finished 后可 publish 为 Book（source: "generated"）加入书架。
 */
import { kvGet, kvKeysWithPrefix, kvRemove, kvSet } from "./kv-db";
import type { Book, BookChapter } from "./bookstore-data";

/* ───────────────────────── 类型 ───────────────────────── */

export type WritingStatus = "draft" | "writing" | "paused" | "finished";

export type WritingChapterStatus = "planned" | "draft" | "revised" | "finished";

/** 大纲节点：第一层 = 章，beats = 剧情节点（两层结构） */
export type WritingOutlineBeat = {
  id: string;
  title: string;
  done?: boolean;
};

export type WritingOutlineItem = {
  id: string;
  title: string;
  summary?: string;
  done?: boolean;
  beats?: WritingOutlineBeat[];
};

export type WritingChapterMeta = {
  id: string;
  title: string;
  order: number;
  summary?: string;
  status: WritingChapterStatus;
  /** 正文字数（保存时计算，列表展示用） */
  wordCount: number;
  createdAt: number;
  updatedAt: number;
};

export type WritingChapterVersion = {
  content: string;
  savedAt: number;
  label?: string;
};

/** 章节正文文档：与 meta 分键存储 */
export type WritingChapterDoc = {
  content: string;
  versions: WritingChapterVersion[];
};

/** 用户手动为作品补充的故事素材 / 共同经历（不进入长期记忆） */
export type WritingMaterial = {
  id: string;
  text: string;
  createdAt: number;
};

export type WritingSourceContext = {
  includeUserProfile?: boolean;
  includeRelationshipMemory?: boolean;
  includeLongTermMemory?: boolean;
  includeRecentMemory?: boolean;
  includeCoReadingMemory?: boolean;
  includeWorldbook?: boolean;
};

export type WritingProject = {
  id: string;
  title: string;
  subtitle?: string;
  createdAt: number;
  updatedAt: number;
  status: WritingStatus;
  genre?: string[];
  tone?: string[];
  pov?: string;
  tense?: string;
  synopsis?: string;
  /** 参与角色（仅 id，真源在 character-storage） */
  roleIds: string[];
  /** 世界卷宗（CharacterWorldGroup id） */
  worldArchiveId?: string;
  /** 世界书（WorldBookConfig id 列表） */
  lorebookIds?: string[];
  outline: WritingOutlineItem[];
  chapters: WritingChapterMeta[];
  /** 项目专属写作要求 / 风格说明 */
  instructions?: string;
  sourceContext: WritingSourceContext;
  /** 把用户自己写进故事 */
  userAsCharacter?: boolean;
  materials: WritingMaterial[];
  /** 最近编辑章节（草稿恢复用） */
  lastChapterId?: string;
};

const INDEX_KEY = "bookroom-writing-projects:v1";
const PROJECT_PREFIX = "bookroom-writing-project:v1:";
const CHAPTER_PREFIX = "bookroom-writing-chapter:v1:";
const GENERATED_META_PREFIX = "bookroom-generated-book:v1:";
const GENERATED_CONTENT_PREFIX = "bookroom-generated-book-content:v1:";
/** 单章版本快照上限 */
const MAX_VERSIONS = 12;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ───────────────────────── 项目 CRUD ───────────────────────── */

function loadIndex(): string[] {
  const parsed = safeParse<string[]>(kvGet(INDEX_KEY));
  return Array.isArray(parsed) ? parsed.filter(id => typeof id === "string") : [];
}

function saveIndex(ids: string[]): void {
  kvSet(INDEX_KEY, JSON.stringify(ids));
}

export function getWritingProject(id: string): WritingProject | null {
  const parsed = safeParse<WritingProject>(kvGet(PROJECT_PREFIX + id));
  if (!parsed || typeof parsed.id !== "string") return null;
  return {
    ...parsed,
    roleIds: Array.isArray(parsed.roleIds) ? parsed.roleIds : [],
    outline: Array.isArray(parsed.outline) ? parsed.outline : [],
    chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials : [],
    sourceContext: parsed.sourceContext ?? {},
  };
}

export function listWritingProjects(): WritingProject[] {
  return loadIndex()
    .map(getWritingProject)
    .filter((p): p is WritingProject => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type CreateWritingProjectInput = {
  title: string;
  subtitle?: string;
  genre?: string[];
  tone?: string[];
  pov?: string;
  synopsis?: string;
  roleIds?: string[];
  worldArchiveId?: string;
  lorebookIds?: string[];
  instructions?: string;
  sourceContext?: WritingSourceContext;
  userAsCharacter?: boolean;
  outline?: WritingOutlineItem[];
};

export function createWritingProject(input: CreateWritingProjectInput): WritingProject {
  const now = Date.now();
  const project: WritingProject = {
    id: uid("wp"),
    title: input.title.trim() || "未命名作品",
    subtitle: input.subtitle,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    genre: input.genre,
    tone: input.tone,
    pov: input.pov,
    synopsis: input.synopsis,
    roleIds: input.roleIds ?? [],
    worldArchiveId: input.worldArchiveId,
    lorebookIds: input.lorebookIds,
    outline: input.outline ?? [],
    chapters: [],
    instructions: input.instructions,
    sourceContext: input.sourceContext ?? {},
    userAsCharacter: input.userAsCharacter,
    materials: [],
  };
  kvSet(PROJECT_PREFIX + project.id, JSON.stringify(project));
  saveIndex([...loadIndex(), project.id]);
  return project;
}

export function updateWritingProject(id: string, patch: Partial<WritingProject>): WritingProject | null {
  const current = getWritingProject(id);
  if (!current) return null;
  const next: WritingProject = { ...current, ...patch, id, updatedAt: Date.now() };
  kvSet(PROJECT_PREFIX + id, JSON.stringify(next));
  return next;
}

export function deleteWritingProject(id: string): void {
  // 清理全部章节内容键
  const prefix = `${CHAPTER_PREFIX}${id}:`;
  for (const key of kvKeysWithPrefix(prefix)) kvRemove(key);
  kvRemove(PROJECT_PREFIX + id);
  saveIndex(loadIndex().filter(x => x !== id));
}

/* ───────────────────────── 章节 ───────────────────────── */

function chapterKey(projectId: string, chapterId: string): string {
  return `${CHAPTER_PREFIX}${projectId}:${chapterId}`;
}

export function loadChapterDoc(projectId: string, chapterId: string): WritingChapterDoc {
  const parsed = safeParse<WritingChapterDoc>(kvGet(chapterKey(projectId, chapterId)));
  if (!parsed || typeof parsed.content !== "string") return { content: "", versions: [] };
  return { content: parsed.content, versions: Array.isArray(parsed.versions) ? parsed.versions : [] };
}

function writeChapterDoc(projectId: string, chapterId: string, doc: WritingChapterDoc): void {
  kvSet(chapterKey(projectId, chapterId), JSON.stringify(doc));
}

export function addWritingChapter(projectId: string, title?: string): WritingChapterMeta | null {
  const project = getWritingProject(projectId);
  if (!project) return null;
  const now = Date.now();
  const meta: WritingChapterMeta = {
    id: uid("wc"),
    title: title?.trim() || `第 ${project.chapters.length + 1} 章`,
    order: project.chapters.length,
    status: "planned",
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  updateWritingProject(projectId, {
    chapters: [...project.chapters, meta],
    lastChapterId: meta.id,
    status: project.status === "draft" ? "writing" : project.status,
  });
  writeChapterDoc(projectId, meta.id, { content: "", versions: [] });
  return meta;
}

export function updateWritingChapterMeta(
  projectId: string,
  chapterId: string,
  patch: Partial<WritingChapterMeta>,
): void {
  const project = getWritingProject(projectId);
  if (!project) return;
  const chapters = project.chapters.map(c =>
    c.id === chapterId ? { ...c, ...patch, id: chapterId, updatedAt: Date.now() } : c);
  updateWritingProject(projectId, { chapters });
}

export function deleteWritingChapter(projectId: string, chapterId: string): void {
  const project = getWritingProject(projectId);
  if (!project) return;
  const chapters = project.chapters
    .filter(c => c.id !== chapterId)
    .map((c, index) => ({ ...c, order: index }));
  kvRemove(chapterKey(projectId, chapterId));
  updateWritingProject(projectId, {
    chapters,
    lastChapterId: project.lastChapterId === chapterId ? chapters[0]?.id : project.lastChapterId,
  });
}

export function reorderWritingChapters(projectId: string, orderedIds: string[]): void {
  const project = getWritingProject(projectId);
  if (!project) return;
  const byId = new Map(project.chapters.map(c => [c.id, c]));
  const chapters: WritingChapterMeta[] = [];
  orderedIds.forEach((id, index) => {
    const meta = byId.get(id);
    if (meta) {
      chapters.push({ ...meta, order: index });
      byId.delete(id);
    }
  });
  for (const rest of byId.values()) chapters.push({ ...rest, order: chapters.length });
  updateWritingProject(projectId, { chapters });
}

/**
 * 保存章节正文（自动保存主入口）。
 * snapshotLabel 存在时（AI 改写 / 润色前），先把当前正文压入版本历史，再写新内容。
 */
export function saveChapterContent(
  projectId: string,
  chapterId: string,
  content: string,
  opts?: { snapshotLabel?: string },
): void {
  const doc = loadChapterDoc(projectId, chapterId);
  let versions = doc.versions;
  if (opts?.snapshotLabel && doc.content !== content) {
    versions = [
      ...versions,
      { content: doc.content, savedAt: Date.now(), label: opts.snapshotLabel },
    ].slice(-MAX_VERSIONS);
  }
  writeChapterDoc(projectId, chapterId, { content, versions });
  updateWritingChapterMeta(projectId, chapterId, {
    wordCount: content.replace(/\s/g, "").length,
    status: content.trim() ? (getWritingProject(projectId)?.chapters.find(c => c.id === chapterId)?.status === "planned" ? "draft" : undefined) : undefined,
  });
  const project = getWritingProject(projectId);
  if (project && project.lastChapterId !== chapterId) {
    updateWritingProject(projectId, { lastChapterId: chapterId });
  }
}

/** 恢复某个历史版本（恢复前把当前正文也压入历史，防止误操作丢失） */
export function restoreChapterVersion(projectId: string, chapterId: string, versionIndex: number): string | null {
  const doc = loadChapterDoc(projectId, chapterId);
  const target = doc.versions[versionIndex];
  if (!target) return null;
  const versions = [
    ...doc.versions,
    { content: doc.content, savedAt: Date.now(), label: "恢复前自动备份" },
  ].slice(-MAX_VERSIONS);
  writeChapterDoc(projectId, chapterId, { content: target.content, versions });
  updateWritingChapterMeta(projectId, chapterId, {
    wordCount: target.content.replace(/\s/g, "").length,
  });
  return target.content;
}

/* ───────────────────────── 素材（故事素材 / 共同经历，非长期记忆） ───────────────────────── */

export function addWritingMaterial(projectId: string, text: string): void {
  const project = getWritingProject(projectId);
  if (!project || !text.trim()) return;
  updateWritingProject(projectId, {
    materials: [...project.materials, { id: uid("wm"), text: text.trim(), createdAt: Date.now() }],
  });
}

export function removeWritingMaterial(projectId: string, materialId: string): void {
  const project = getWritingProject(projectId);
  if (!project) return;
  updateWritingProject(projectId, {
    materials: project.materials.filter(m => m.id !== materialId),
  });
}

/* ───────────────────────── 发布为书架书籍 ───────────────────────── */

function generatedMetaKey(bookId: string): string {
  return GENERATED_META_PREFIX + bookId;
}

function generatedContentKey(bookId: string): string {
  return GENERATED_CONTENT_PREFIX + bookId;
}

/**
 * 把已完成的作品发布为一本 Book（source: "generated"），meta / 正文分键存储。
 * 返回 null 表示项目不存在或没有任何已写内容。
 */
export function publishProjectAsBook(projectId: string): Book | null {
  const project = getWritingProject(projectId);
  if (!project) return null;
  const chapters: BookChapter[] = [...project.chapters]
    .sort((a, b) => a.order - b.order)
    .map(meta => ({
      id: meta.id,
      title: meta.title,
      content: loadChapterDoc(projectId, meta.id)
        .content.split(/\n{2,}|\r?\n/)
        .map(p => p.trim())
        .filter(Boolean),
    }))
    .filter(c => c.content.length > 0);
  if (chapters.length === 0) return null;

  const bookId = `generated-${project.id}`;
  const roleNote = project.roleIds.length > 0 ? "与 TA 一起完成的作品" : "在书房书桌完成的作品";
  const book: Book = {
    id: bookId,
    title: project.title,
    author: "书房 · AI 写作",
    category: project.genre?.[0] || "原创",
    type: "book",
    description: project.synopsis?.trim() || roleNote,
    coverTone: "paper",
    source: "generated",
  };
  kvSet(generatedMetaKey(bookId), JSON.stringify(book));
  kvSet(generatedContentKey(bookId), JSON.stringify(chapters));
  return { ...book, chapters };
}

/** 读取 AI 作品 Book（书架 / 共读记录解析用） */
export function getGeneratedBook(bookId: string, withContent?: boolean): Book | null {
  const meta = safeParse<Book>(kvGet(generatedMetaKey(bookId)));
  if (!meta || typeof meta.id !== "string") return null;
  if (!withContent) return meta;
  const chapters = safeParse<BookChapter[]>(kvGet(generatedContentKey(bookId)));
  return { ...meta, chapters: Array.isArray(chapters) ? chapters : [] };
}

export function deleteGeneratedBook(bookId: string): void {
  kvRemove(generatedMetaKey(bookId));
  kvRemove(generatedContentKey(bookId));
}
