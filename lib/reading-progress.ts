/**
 * 书房文字阅读器 — 阅读进度持久化（Phase 2A）。
 * 复用项目现有 kv-db（localStorage 封装），不引入新数据库。
 * key 前缀与旧 ReadingApp（reading-*）隔离，互不影响。
 */
import { kvGet, kvKeysWithPrefix, kvSet } from "./kv-db";
import type { Book } from "./bookstore-data";

export type ReadingProgress = {
  bookId: string;
  /** 当前章节下标 */
  chapterIndex: number;
  /** 章节内滚动百分比 0~1 */
  scrollProgress: number;
  /** 最后阅读时间戳 */
  updatedAt?: number;
};

const KEY_PREFIX = "bookroom-reading-progress:";

function storageKey(bookId: string): string {
  return `${KEY_PREFIX}${bookId}`;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 读取某本书的阅读进度，无记录 / 数据损坏时返回 null */
export function loadReadingProgress(bookId: string): ReadingProgress | null {
  const raw = kvGet(storageKey(bookId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReadingProgress>;
    if (
      typeof parsed.bookId === "string"
      && typeof parsed.chapterIndex === "number"
      && typeof parsed.scrollProgress === "number"
    ) {
      return {
        bookId: parsed.bookId,
        chapterIndex: Math.max(0, Math.floor(parsed.chapterIndex)),
        scrollProgress: clamp01(parsed.scrollProgress),
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/** 保存阅读进度（章节切换 / 滚动节流 / 离开阅读器时调用） */
export function saveReadingProgress(progress: Omit<ReadingProgress, "updatedAt"> & { updatedAt?: number }): ReadingProgress {
  const normalized: ReadingProgress = {
    bookId: progress.bookId,
    chapterIndex: Math.max(0, Math.floor(progress.chapterIndex)),
    scrollProgress: clamp01(progress.scrollProgress),
    updatedAt: progress.updatedAt ?? Date.now(),
  };
  kvSet(storageKey(normalized.bookId), JSON.stringify(normalized));
  return normalized;
}

/** 全部有记录的进度（按最后阅读时间倒序），用于首页「继续阅读」 */
export function listReadingProgress(): ReadingProgress[] {
  const result: ReadingProgress[] = [];
  for (const key of kvKeysWithPrefix(KEY_PREFIX)) {
    const raw = kvGet(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as ReadingProgress;
      if (typeof parsed?.bookId === "string" && typeof parsed.chapterIndex === "number") {
        result.push({
          bookId: parsed.bookId,
          chapterIndex: Math.max(0, Math.floor(parsed.chapterIndex)),
          scrollProgress: clamp01(parsed.scrollProgress ?? 0),
          updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
        });
      }
    } catch {
      // 忽略损坏记录
    }
  }
  return result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/**
 * 总体阅读百分比（0~100）：
 * - 普通书：按章节均分，章节内滚动计入当前章。
 * - 漫画：scrollProgress 即整卷纵向滚动比例，直接换算。
 * 无章节/页信息时回退为 0。
 */
export function getOverallPercent(book: Book, progress?: ReadingProgress | null): number {
  if (!progress) return 0;
  // 漫画：以整体滚动比例作为阅读百分比
  if (book.pages && book.pages.length > 0) {
    return Math.round(clamp01(progress.scrollProgress) * 100);
  }
  const total = book.chapters?.length ?? 0;
  if (!total) return 0;
  const index = Math.min(progress.chapterIndex, total - 1);
  const fraction = (index + clamp01(progress.scrollProgress)) / total;
  // 最后一章滚动到底即视为读完
  if (index === total - 1 && progress.scrollProgress >= 0.98) return 100;
  return Math.round(fraction * 100);
}
