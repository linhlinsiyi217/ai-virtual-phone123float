/**
 * 书房 — 用户导入书籍持久化（Phase 4B）。
 *
 * 复用项目现有 kv-db（AiPhoneKvDB），不引入新数据库。
 * 数据隔离：
 *   - 导入书是用户的本地内容，只存 kv-db；
 *   - 与阅读进度（bookroom-reading-progress:）、标注（bookroom-annotations:）完全分开；
 *   - 不进入长期 AI 记忆。
 *
 * 分键策略（元数据小、正文大）：
 *   - bookroom-imported:meta:v1:<id>     → Book 元数据（不含 chapters，供书架列表，小）
 *   - bookroom-imported:chapters:v1:<id>  → BookChapter[] 正文（打开详情/阅读时才加载）
 *
 * 删除导入书只清这两个键 + 调用方按需清进度/标注；绝不触碰用户设备原文件。
 */
import { kvGet, kvKeysWithPrefix, kvRemove, kvSet } from "./kv-db";
import type { Book, BookChapter } from "./bookstore-data";

const META_PREFIX = "bookroom-imported:meta:v1:";
const CHAPTERS_PREFIX = "bookroom-imported:chapters:v1:";

function metaKey(id: string): string {
  return `${META_PREFIX}${id}`;
}

function chaptersKey(id: string): string {
  return `${CHAPTERS_PREFIX}${id}`;
}

function makeId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 校验并返回 Book 元数据；损坏数据返回 null */
function parseMeta(raw: string | null): Book | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const book = obj as Book;
    if (typeof book.id !== "string" || typeof book.title !== "string") return null;
    return book;
  } catch {
    return null;
  }
}

function parseChapters(raw: string | null): BookChapter[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (c): c is BookChapter =>
        !!c && typeof c === "object" && typeof (c as BookChapter).title === "string" && Array.isArray((c as BookChapter).content),
    );
  } catch {
    return null;
  }
}

/** 列出全部导入书的元数据（按导入时间倒序）；损坏条目跳过 */
export function listImportedBooks(): Book[] {
  const keys = kvKeysWithPrefix(META_PREFIX);
  const books: Book[] = [];
  for (const key of keys) {
    const meta = parseMeta(kvGet(key));
    if (meta) books.push(meta);
  }
  return books.sort(
    (a, b) => (b.importInfo?.importedAt ?? 0) - (a.importInfo?.importedAt ?? 0),
  );
}

/** 读取单本导入书元数据（不含章节） */
export function getImportedBookMeta(id: string): Book | null {
  return parseMeta(kvGet(metaKey(id)));
}

/** 读取单本导入书并合并章节（打开详情/阅读时用）；无章节则返回仅含 meta 的 Book */
export function getImportedBookWithChapters(id: string): Book | null {
  const meta = getImportedBookMeta(id);
  if (!meta) return null;
  const chapters = parseChapters(kvGet(chaptersKey(id))) ?? [];
  return { ...meta, chapters };
}

/** 保存导入书：meta 与 chapters 分键写入。book.chapters 不会被写入 meta（保持 meta 轻量）。 */
export function saveImportedBook(book: Book, chapters: BookChapter[]): void {
  // 元数据剥离 chapters（若存在），保持 meta 轻量
  const { chapters: _omit, ...meta } = book;
  void _omit;
  kvSet(metaKey(book.id), JSON.stringify(meta));
  kvSet(chaptersKey(book.id), JSON.stringify(chapters));
}

/** 删除导入书的解析数据（meta + chapters）；不删用户原文件。
 *  返回被删除的 bookId（用于调用方提示）；不存在返回 null。 */
export function deleteImportedBook(id: string): string | null {
  const meta = getImportedBookMeta(id);
  kvRemove(metaKey(id));
  kvRemove(chaptersKey(id));
  return meta ? id : null;
}

/** 疑似重复检测：按 fileName + fileSize 命中；次级按 title+author 命中。返回匹配项或 null。 */
export function findImportedDuplicate(
  fileName: string,
  fileSize?: number,
  title?: string,
  author?: string,
): Book | null {
  const books = listImportedBooks();
  // 主：文件名 + 大小完全一致
  const byFile = books.find(
    b =>
      b.importInfo?.fileName === fileName &&
      (fileSize === undefined || b.importInfo?.fileSize === fileSize),
  );
  if (byFile) return byFile;
  // 次：标题 + 作者一致（忽略大小写/空白）
  if (title) {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    const t = norm(title);
    const a = author ? norm(author) : "";
    const byTitle = books.find(b => {
      const bt = norm(b.title);
      const ba = b.author ? norm(b.author) : "";
      return bt === t && (!a || ba === a);
    });
    if (byTitle) return byTitle;
  }
  return null;
}

export { makeId as makeImportedBookId };
