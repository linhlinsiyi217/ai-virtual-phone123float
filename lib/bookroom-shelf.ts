/**
 * 书房 — 我的书架 / 收藏 / 分组 / 当前陪读角色 的统一持久化（Phase 5A 重构）。
 *
 * 设计原则：
 * - 不再用 Book.inShelf / favorite / progress 等分散字段假装用户拥有某本书；
 * - 建立统一的 BookshelfEntry，真实记录用户「拥有」每本书的状态；
 * - 书架内容只来自：用户主动加入的内置书、导入书、在线书 metadata 快照；
 * - 复用现有 kv-db（localStorage/IDB 封装），不引入新数据库；
 * - key 前缀 bookroom-* 与旧 ReadingApp（reading-*）隔离。
 *
 * 存储键：
 *   bookroom-shelf-entry:v1:<bookId>   → BookshelfEntry
 *   bookroom-shelf-collections:v1      → BookCollection[]
 *   bookroom-shelf-order:v1            → string[]（bookId 自定义排序）
 *   bookroom-online-snapshot:v1:<id>   → 在线书 metadata 快照（不含正文）
 *   bookroom-shelf:v1 / bookroom-favorites:v1 → 旧版 id 集合（迁移后不再写入）
 *   bookroom-companion:v1              → 当前陪读角色 id
 */
import { kvGet, kvKeysWithPrefix, kvRemove, kvSet } from "./kv-db";
import { MOCK_BOOKS, type Book } from "./bookstore-data";
import { getImportedBookMeta, getImportedBookWithChapters } from "./bookroom-import";

const ENTRY_PREFIX = "bookroom-shelf-entry:v1:";
const COLLECTIONS_KEY = "bookroom-shelf-collections:v1";
const ORDER_KEY = "bookroom-shelf-order:v1";
const SNAPSHOT_PREFIX = "bookroom-online-snapshot:v1:";

// 旧版兼容（迁移后不再写入）
const LEGACY_SHELF_KEY = "bookroom-shelf:v1";
const LEGACY_FAVORITES_KEY = "bookroom-favorites:v1";
const COMPANION_KEY = "bookroom-companion:v1";

export type ShelfStatus = "unread" | "reading" | "finished" | "paused";

export type ShelfSource = "builtin" | "imported" | "online";

export type BookshelfEntry = {
  bookId: string;
  source: ShelfSource;
  addedAt: number;
  status: ShelfStatus;
  favorite?: boolean;
  lastReadAt?: number;
  finishedAt?: number;
  /** 所属自定义分组 id 列表（一本书可属多个分组） */
  collectionIds?: string[];
  customTitle?: string;
  customCover?: string;
  hidden?: boolean;
};

export type BookCollection = {
  id: string;
  name: string;
  createdAt: number;
};

/* ───────────────────────── 内部工具 ───────────────────────── */

function entryKey(bookId: string): string {
  return `${ENTRY_PREFIX}${bookId}`;
}

function snapshotKey(bookId: string): string {
  return `${SNAPSHOT_PREFIX}${bookId}`;
}

function now(): number {
  return Date.now();
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ───────────────────────── 旧版迁移 ───────────────────────── */

let migrated = false;

/**
 * 把旧版 id 集合（bookroom-shelf:v1 / bookroom-favorites:v1）迁移为 BookshelfEntry。
 * 只执行一次（进程内）；已存在 entry 的书跳过，避免覆盖用户状态。
 */
export function migrateLegacyShelf(): void {
  if (migrated) return;
  migrated = true;

  const rawShelf = kvGet(LEGACY_SHELF_KEY);
  const rawFav = kvGet(LEGACY_FAVORITES_KEY);
  if (!rawShelf && !rawFav) return;

  const shelfIds: string[] = safeParse<string[]>(rawShelf) ?? [];
  const favIds: string[] = safeParse<string[]>(rawFav) ?? [];
  const favSet = new Set(favIds);

  for (const id of shelfIds) {
    if (kvGet(entryKey(id))) continue; // 已有 entry，保留
    const entry: BookshelfEntry = {
      bookId: id,
      source: "builtin",
      addedAt: 0,
      status: "unread",
      favorite: favSet.has(id),
    };
    kvSet(entryKey(id), JSON.stringify(entry));
  }
  // 仅在收藏但未在书架的书：同样建 entry（favorite=true），保持收藏可见
  for (const id of favIds) {
    if (kvGet(entryKey(id))) continue;
    const entry: BookshelfEntry = {
      bookId: id,
      source: "builtin",
      addedAt: 0,
      status: "unread",
      favorite: true,
    };
    kvSet(entryKey(id), JSON.stringify(entry));
  }
}

/* ───────────────────────── BookshelfEntry 读写 ───────────────────────── */

/** 列出全部书架条目（排除 hidden），按 addedAt 升序（加入顺序）。 */
export function listShelfEntries(): BookshelfEntry[] {
  migrateLegacyShelf();
  const result: BookshelfEntry[] = [];
  for (const key of kvKeysWithPrefix(ENTRY_PREFIX)) {
    const e = safeParse<BookshelfEntry>(kvGet(key));
    if (e && typeof e.bookId === "string" && !e.hidden) result.push(e);
  }
  return result.sort((a, b) => a.addedAt - b.addedAt);
}

export function getShelfEntry(bookId: string): BookshelfEntry | null {
  migrateLegacyShelf();
  return safeParse<BookshelfEntry>(kvGet(entryKey(bookId)));
}

export function saveShelfEntry(entry: BookshelfEntry): void {
  kvSet(entryKey(entry.bookId), JSON.stringify(entry));
}

/** 加入书架（若已存在则不覆盖状态）；返回最新 entry。 */
export function addToShelf(
  bookId: string,
  source: ShelfSource,
  opts?: { favorite?: boolean },
): BookshelfEntry {
  const existing = getShelfEntry(bookId);
  if (existing) {
    if (opts?.favorite !== undefined && existing.favorite !== opts.favorite) {
      existing.favorite = opts.favorite;
      saveShelfEntry(existing);
    }
    return existing;
  }
  const entry: BookshelfEntry = {
    bookId,
    source,
    addedAt: now(),
    status: "unread",
    favorite: opts?.favorite,
  };
  saveShelfEntry(entry);
  return entry;
}

/** 移出书架（只删 entry，不删阅读进度 / 标注 / 导入正文）。 */
export function removeFromShelf(bookId: string): void {
  kvRemove(entryKey(bookId));
}

export function setShelfStatus(bookId: string, status: ShelfStatus): void {
  const e = getShelfEntry(bookId);
  if (!e) return;
  e.status = status;
  if (status === "finished") e.finishedAt = now();
  saveShelfEntry(e);
}

/** 打开阅读器时调用：自动置为 reading，记录 lastReadAt。 */
export function markReading(bookId: string): void {
  const e = getShelfEntry(bookId);
  if (!e) return;
  e.status = "reading";
  e.lastReadAt = now();
  saveShelfEntry(e);
}

/** 进度达 100% 时调用：自动置为 finished。 */
export function markFinished(bookId: string): void {
  const e = getShelfEntry(bookId);
  if (!e) return;
  e.status = "finished";
  e.finishedAt = now();
  saveShelfEntry(e);
}

export function toggleFavorite(bookId: string, favorite: boolean): void {
  const e = getShelfEntry(bookId);
  if (!e) {
    // 不在书架但直接收藏：建一个 entry
    addToShelf(bookId, "builtin", { favorite });
    return;
  }
  e.favorite = favorite;
  saveShelfEntry(e);
}

export function isFavorite(bookId: string): boolean {
  return Boolean(getShelfEntry(bookId)?.favorite);
}

export function isInShelf(bookId: string): boolean {
  return getShelfEntry(bookId) !== null;
}

/* ───────────────────────── 分组（书单） ───────────────────────── */

export function listCollections(): BookCollection[] {
  return safeParse<BookCollection[]>(kvGet(COLLECTIONS_KEY)) ?? [];
}

function saveCollections(collections: BookCollection[]): void {
  kvSet(COLLECTIONS_KEY, JSON.stringify(collections));
}

export function createCollection(name: string): BookCollection {
  const collections = listCollections();
  const col: BookCollection = {
    id: `col_${now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "未命名分组",
    createdAt: now(),
  };
  collections.push(col);
  saveCollections(collections);
  return col;
}

export function renameCollection(id: string, name: string): void {
  const collections = listCollections();
  const col = collections.find(c => c.id === id);
  if (col) {
    col.name = name.trim() || col.name;
    saveCollections(collections);
  }
}

/** 删除分组：不删书本身，只从各 entry 的 collectionIds 中移除该分组。 */
export function deleteCollection(id: string): void {
  const collections = listCollections().filter(c => c.id !== id);
  saveCollections(collections);
  // 清理所有 entry 中的该分组引用
  for (const e of listShelfEntries()) {
    if (e.collectionIds?.includes(id)) {
      e.collectionIds = e.collectionIds.filter(cid => cid !== id);
      if (e.collectionIds.length === 0) e.collectionIds = undefined;
      saveShelfEntry(e);
    }
  }
}

export function addToCollection(bookId: string, collectionId: string): void {
  const e = getShelfEntry(bookId);
  if (!e) return;
  e.collectionIds = Array.from(new Set([...(e.collectionIds ?? []), collectionId]));
  saveShelfEntry(e);
}

export function removeFromCollection(bookId: string, collectionId: string): void {
  const e = getShelfEntry(bookId);
  if (!e?.collectionIds) return;
  e.collectionIds = e.collectionIds.filter(id => id !== collectionId);
  if (e.collectionIds.length === 0) e.collectionIds = undefined;
  saveShelfEntry(e);
}

/* ───────────────────────── 排序 ───────────────────────── */

export function loadShelfOrder(): string[] {
  return safeParse<string[]>(kvGet(ORDER_KEY)) ?? [];
}

export function saveShelfOrder(order: string[]): void {
  kvSet(ORDER_KEY, JSON.stringify(order));
}

/**
 * 按自定义顺序排序 bookId 列表。
 * 自定义顺序里的书按其位置排前，未在顺序中的按 fallback 排序追加。
 */
export function applyCustomOrder(ids: string[], order: string[]): string[] {
  const pos = new Map<string, number>();
  order.forEach((id, i) => pos.set(id, i));
  return [...ids].sort((a, b) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return 0;
  });
}

/* ───────────────────────── 在线书 metadata 快照 ───────────────────────── */

/**
 * 保存在线书的 metadata 快照（不含 chapters 正文），供书架列表展示。
 * 在线书加入书架时调用。
 */
export function saveOnlineSnapshot(book: Book): void {
  // 剥离 chapters（若有），保持快照轻量
  const { chapters: _omit, pages: _omitPages, ...snapshot } = book;
  void _omit;
  void _omitPages;
  kvSet(snapshotKey(book.id), JSON.stringify(snapshot));
}

export function getOnlineSnapshot(bookId: string): Book | null {
  return safeParse<Book>(kvGet(snapshotKey(bookId)));
}

export function removeOnlineSnapshot(bookId: string): void {
  kvRemove(snapshotKey(bookId));
}

/* ───────────────────────── 当前陪读角色 ───────────────────────── */

export function loadCompanionId(): string | null {
  const id = kvGet(COMPANION_KEY);
  return id && typeof id === "string" ? id : null;
}

export function saveCompanionId(roleId: string): void {
  kvSet(COMPANION_KEY, roleId);
}

/* ───────────────────────── 旧版兼容 API（内部委托给 entry 层） ───────────────────────── */

/** 旧版：返回所有在书架的 bookId（含 favorite-only 的）。供未迁移组件过渡。 */
export function loadShelfIds(): Set<string> {
  const entries = listShelfEntries();
  return new Set(entries.map(e => e.bookId));
}

/** 旧版兼容：加入/移出书架。新代码请直接用 addToShelf / removeFromShelf。 */
export function toggleShelfId(bookId: string, inShelf: boolean): Set<string> {
  if (inShelf) addToShelf(bookId, "builtin");
  else removeFromShelf(bookId);
  return loadShelfIds();
}

/** 旧版兼容：收藏 id 集合。 */
export function loadFavoriteIds(): Set<string> {
  const entries = listShelfEntries().filter(e => e.favorite);
  return new Set(entries.map(e => e.bookId));
}

/** 旧版兼容：切换收藏。 */
export function toggleFavoriteId(bookId: string, favorite: boolean): Set<string> {
  toggleFavorite(bookId, favorite);
  return loadFavoriteIds();
}

/* ───────────────────────── 统一书籍解析（书架 / 共读记录共用） ───────────────────────── */

/**
 * 由 bookId 解析 Book：builtin → MOCK_BOOKS；imported → kv-db；online → metadata 快照。
 * 默认不加载导入书正文（列表性能）；withContent=true 时才读取完整章节（进入阅读器前）。
 */
export function resolveShelfBook(bookId: string, opts?: { withContent?: boolean }): Book | null {
  const builtin = MOCK_BOOKS.find(b => b.id === bookId);
  if (builtin) return builtin;
  const imported = opts?.withContent
    ? getImportedBookWithChapters(bookId) ?? getImportedBookMeta(bookId)
    : getImportedBookMeta(bookId);
  if (imported) return imported;
  return getOnlineSnapshot(bookId);
}
