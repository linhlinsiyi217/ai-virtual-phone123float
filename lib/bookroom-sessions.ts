/**
 * 书房「共读记录」— CoReadingSession 数据层（Phase 5B）。
 *
 * 架构原则（硬要求）：
 *   - Float 全局角色系统（character-storage）是唯一角色真源；
 *     session 只保存 roleId 引用 + roleSnapshot（仅用于历史展示，永不作为 AI 上下文来源）。
 *   - 共读聊天消息仍由 bookroom-co-session.ts 按 roleId::bookId 存储，本层不重复保存消息，
 *     只记录会话元数据（进度 / 位置 / 消息数 / 状态 / 摘要）。
 *   - 短期会话（本层 + co-session 消息）≠ 长期记忆；长期记忆只经 bookroom-ai-context 选择性写回。
 *   - 复用现有 kv-db，不引入新数据库；不写完整书籍正文，只记位置与短片段。
 *
 * 创建规则：用户选择角色并打开「一起读 / 一起看漫画」才创建；仅打开书籍不创建。
 * 同一 roleId + bookId 存在未结束（active / paused）session 时优先继续，不重复新建。
 */
import { kvGet, kvSet } from "./kv-db";
import type { Book, BookContentType } from "./bookstore-data";
import { loadCharacters } from "./character-storage";

export type CoReadingStatus = "active" | "paused" | "finished";

export type CoReadingSession = {
  id: string;
  roleId: string;
  bookId: string;
  contentType: BookContentType;
  /** 书籍 metadata 快照：书被移出 / 删除后，历史记录仍可正常展示 */
  bookTitle: string;
  bookAuthor: string;

  startedAt: number;
  updatedAt: number;
  endedAt?: number;

  /** 共读起点（共读范围展示用） */
  startChapterIndex?: number;
  startPageIndex?: number;
  /** 当前共读位置 */
  chapterIndex?: number;
  pageIndex?: number;
  /** 整体进度 0~100 */
  progress: number;

  messageCount: number;
  /** 最近阅读位置对应的短片段（不上传全文） */
  lastExcerpt?: string;

  status: CoReadingStatus;

  /** 仅用于历史展示的「当时角色形象」快照；当前角色信息永远实时读 canonical 角色卡 */
  roleSnapshot?: {
    name: string;
    avatar?: string | null;
  };

  /** 轻量摘要（会话结束 / 主动结束时本地生成），用于下次恢复共读上下文；不替代聊天记录 */
  summary?: string;
};

const STORAGE_KEY = "bookroom-sessions:v1";
/** 历史上限：超出后优先清理最旧的已结束会话 */
const MAX_SESSIONS = 200;
/** 进度写入节流：避免滚动 / 翻页期间每帧写 kv-db */
const PROGRESS_THROTTLE_MS = 1500;

/* ───────────────────────── 内部存取 ───────────────────────── */

function isValidSession(x: unknown): x is CoReadingSession {
  if (!x || typeof x !== "object") return false;
  const s = x as CoReadingSession;
  return (
    typeof s.id === "string"
    && typeof s.roleId === "string"
    && typeof s.bookId === "string"
    && (s.contentType === "book" || s.contentType === "manga")
    && typeof s.startedAt === "number"
    && typeof s.updatedAt === "number"
    && ["active", "paused", "finished"].includes(s.status)
  );
}

function loadAll(): CoReadingSession[] {
  const raw = kvGet(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

function saveAll(sessions: CoReadingSession[]): void {
  let next = sessions;
  if (next.length > MAX_SESSIONS) {
    const overflow = next.length - MAX_SESSIONS;
    const rank = (s: CoReadingSession) => (s.status === "finished" ? 0 : s.status === "paused" ? 1 : 2);
    const removable = [...next]
      .sort((a, b) => rank(a) - rank(b) || a.updatedAt - b.updatedAt)
      .slice(0, overflow)
      .map(s => s.id);
    const drop = new Set(removable);
    next = next.filter(s => !drop.has(s.id));
  }
  kvSet(STORAGE_KEY, JSON.stringify(next));
}

function patchSession(id: string, patch: Partial<CoReadingSession>): CoReadingSession | null {
  const all = loadAll();
  const index = all.findIndex(s => s.id === id);
  if (index < 0) return null;
  const merged: CoReadingSession = { ...all[index], ...patch, id, updatedAt: patch.updatedAt ?? Date.now() };
  all[index] = merged;
  saveAll(all);
  return merged;
}

/* ───────────────────────── 查询 ───────────────────────── */

/** 全部共读记录，按最近更新降序 */
export function listCoSessions(): CoReadingSession[] {
  return loadAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCoSession(id: string): CoReadingSession | null {
  return loadAll().find(s => s.id === id) ?? null;
}

/** 同角色 × 同书 的进行中会话（active / paused 均可继续） */
export function findResumableCoSession(roleId: string, bookId: string): CoReadingSession | null {
  const found = loadAll()
    .filter(s => s.roleId === roleId && s.bookId === bookId && s.status !== "finished")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return found[0] ?? null;
}

/** 同角色 × 同书 最近一条记录（含已结束，用于「继续上次共读」提示） */
export function findLatestCoSession(roleId: string, bookId: string): CoReadingSession | null {
  const found = loadAll()
    .filter(s => s.roleId === roleId && s.bookId === bookId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return found[0] ?? null;
}

/* ───────────────────────── 创建 / 继续 ───────────────────────── */

function snapshotRole(roleId: string): { name: string; avatar?: string | null } {
  try {
    const character = loadCharacters().find(c => c.id === roleId);
    if (character) return { name: character.name, avatar: character.avatar ?? null };
  } catch {
    // kv-db 未水合等：快照降级为占位
  }
  return { name: "已移除角色", avatar: null };
}

/**
 * 开始或继续共读：
 *   - 存在同 roleId + bookId 的未结束会话 → 置回 active 并返回（resumed=true）；
 *   - 否则创建新会话（resumed=false），角色快照取创建时点的 canonical 形象。
 */
export function startOrResumeCoSession(
  roleId: string,
  book: Book,
  position?: { chapterIndex?: number; pageIndex?: number; progress?: number },
): { session: CoReadingSession; resumed: boolean } {
  const now = Date.now();
  const existing = findResumableCoSession(roleId, book.id);
  if (existing) {
    const session = patchSession(existing.id, {
      status: "active",
      endedAt: undefined,
      updatedAt: now,
      ...(position?.chapterIndex !== undefined ? { chapterIndex: position.chapterIndex } : {}),
      ...(position?.pageIndex !== undefined ? { pageIndex: position.pageIndex } : {}),
      ...(position?.progress !== undefined ? { progress: position.progress } : {}),
    });
    return { session: session ?? existing, resumed: true };
  }

  const session: CoReadingSession = {
    id: `crs_${now}_${Math.random().toString(36).slice(2, 8)}`,
    roleId,
    bookId: book.id,
    contentType: book.type === "manga" ? "manga" : "book",
    bookTitle: book.title,
    bookAuthor: book.author,
    startedAt: now,
    updatedAt: now,
    startChapterIndex: position?.chapterIndex,
    startPageIndex: position?.pageIndex,
    chapterIndex: position?.chapterIndex,
    pageIndex: position?.pageIndex,
    progress: Math.round(position?.progress ?? 0),
    messageCount: 0,
    status: "active",
    roleSnapshot: snapshotRole(roleId),
  };
  saveAll([...loadAll(), session]);
  return { session, resumed: false };
}

/* ───────────────────────── 进度 / 消息更新 ───────────────────────── */

const lastProgressWrite = new Map<string, number>();

export type CoSessionProgressPatch = {
  chapterIndex?: number;
  pageIndex?: number;
  /** 0~100 */
  progress?: number;
  lastExcerpt?: string;
};

/**
 * 阅读过程中更新会话位置 / 进度（章节、翻页、进度变化、退出等节点调用）。
 * 仅当存在该角色 × 该书的进行中会话时才写；进度类写入做节流，位置变化 / 读完全立即写。
 */
export function noteCoSessionProgress(roleId: string, bookId: string, patch: CoSessionProgressPatch): void {
  if (!roleId || !bookId) return;
  const session = findResumableCoSession(roleId, bookId);
  if (!session) return;

  const positionChanged =
    (patch.chapterIndex !== undefined && patch.chapterIndex !== session.chapterIndex)
    || (patch.pageIndex !== undefined && patch.pageIndex !== session.pageIndex);
  const completed = (patch.progress ?? 0) >= 100 && session.progress < 100;

  const now = Date.now();
  const last = lastProgressWrite.get(session.id) ?? 0;
  if (!positionChanged && !completed && now - last < PROGRESS_THROTTLE_MS) return;

  lastProgressWrite.set(session.id, now);
  patchSession(session.id, {
    ...(patch.chapterIndex !== undefined ? { chapterIndex: patch.chapterIndex } : {}),
    ...(patch.pageIndex !== undefined ? { pageIndex: patch.pageIndex } : {}),
    ...(patch.progress !== undefined ? { progress: Math.round(patch.progress) } : {}),
    ...(patch.lastExcerpt ? { lastExcerpt: patch.lastExcerpt.slice(0, 120) } : {}),
    updatedAt: now,
  });
}

/** 聊天发送 / 回复后同步消息数（消息本体仍在 bookroom-co-session） */
export function syncCoSessionMessageCount(sessionId: string, messageCount: number, lastExcerpt?: string): void {
  patchSession(sessionId, {
    messageCount,
    ...(lastExcerpt ? { lastExcerpt: lastExcerpt.slice(0, 120) } : {}),
  });
}

/* ───────────────────────── 状态流转 ───────────────────────── */

/** 关闭共读层 / 离开：暂停（保留会话，下次优先继续） */
export function pauseCoSession(id: string): void {
  const session = getCoSession(id);
  if (!session || session.status !== "active") return;
  patchSession(id, { status: "paused" });
}

/** 结束共读：生成轻量摘要（本地生成，不调用 AI），会话进入历史 */
export function finishCoSession(id: string, summary?: string): void {
  const session = getCoSession(id);
  if (!session || session.status === "finished") return;
  patchSession(id, {
    status: "finished",
    endedAt: Date.now(),
    ...(summary ? { summary } : {}),
  });
}

/**
 * 本地轻量摘要：共读范围 + 进度 + 消息数 + 最近话题。
 * 不调用 AI、不替代聊天记录，仅供下次恢复共读时快速进入状态。
 */
export function buildCoSessionSummary(
  session: CoReadingSession,
  recentUserMessages: string[],
): string {
  const where = session.contentType === "manga"
    ? `一起看到第 ${(session.pageIndex ?? 0) + 1} 页`
    : `一起读到第 ${(session.chapterIndex ?? 0) + 1} 章`;
  const lastUser = recentUserMessages.filter(Boolean).slice(-1)[0] ?? "";
  const tail = lastUser
    ? `最近聊到：“${lastUser.slice(0, 40)}${lastUser.length > 40 ? "…" : ""}”`
    : "本次暂无对话记录";
  return `${where}（进度约 ${session.progress}%），共 ${session.messageCount} 条消息。${tail}`;
}

/* ───────────────────────── 真实统计（供我的 / 书桌后续接入） ───────────────────────── */

export type CoReadingStats = {
  totalSessions: number;
  activeSessions: number;
  finishedSessions: number;
  totalMessages: number;
  /** 共读次数最多的角色 */
  topRoles: { roleId: string; count: number }[];
  /** 最近共读的内容 */
  recentBooks: { bookId: string; title: string; updatedAt: number }[];
};

export function getCoReadingStats(): CoReadingStats {
  const all = loadAll();
  const roleCount = new Map<string, number>();
  let totalMessages = 0;
  for (const s of all) {
    roleCount.set(s.roleId, (roleCount.get(s.roleId) ?? 0) + 1);
    totalMessages += s.messageCount ?? 0;
  }
  const topRoles = [...roleCount.entries()]
    .map(([roleId, count]) => ({ roleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const recentBooks = [...all]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map(s => ({ bookId: s.bookId, title: s.bookTitle, updatedAt: s.updatedAt }));
  return {
    totalSessions: all.length,
    activeSessions: all.filter(s => s.status === "active").length,
    finishedSessions: all.filter(s => s.status === "finished").length,
    totalMessages,
    topRoles,
    recentBooks,
  };
}
