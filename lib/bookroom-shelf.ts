/**
 * 书房 — 我的书架 / 收藏 / 当前陪读角色 的轻量持久化。
 * 复用现有 kv-db（localStorage/IDB 封装），不引入新数据库。
 * key 前缀 bookroom-* 与旧 ReadingApp（reading-*）隔离。
 */
import { kvGet, kvSet } from "./kv-db";

const SHELF_KEY = "bookroom-shelf:v1";
const FAVORITES_KEY = "bookroom-favorites:v1";
const COMPANION_KEY = "bookroom-companion:v1";

function readIdSet(key: string): Set<string> {
  const raw = kvGet(key);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string"));
    }
  } catch {
    // 损坏数据按空集合处理
  }
  return new Set();
}

function writeIdSet(key: string, ids: Set<string>): void {
  kvSet(key, JSON.stringify([...ids]));
}

/* ───────────────────────── 我的书架 ───────────────────────── */

export function loadShelfIds(): Set<string> {
  return readIdSet(SHELF_KEY);
}

/** 加入 / 移出书架，返回操作后的最新集合 */
export function toggleShelfId(bookId: string, inShelf: boolean): Set<string> {
  const ids = readIdSet(SHELF_KEY);
  if (inShelf) ids.add(bookId);
  else ids.delete(bookId);
  writeIdSet(SHELF_KEY, ids);
  return ids;
}

/* ───────────────────────── 收藏 ───────────────────────── */

export function loadFavoriteIds(): Set<string> {
  return readIdSet(FAVORITES_KEY);
}

export function toggleFavoriteId(bookId: string, favorite: boolean): Set<string> {
  const ids = readIdSet(FAVORITES_KEY);
  if (favorite) ids.add(bookId);
  else ids.delete(bookId);
  writeIdSet(FAVORITES_KEY, ids);
  return ids;
}

/* ───────────────────────── 当前陪读角色 ───────────────────────── */

export function loadCompanionId(): string | null {
  const id = kvGet(COMPANION_KEY);
  return id && typeof id === "string" ? id : null;
}

export function saveCompanionId(roleId: string): void {
  kvSet(COMPANION_KEY, roleId);
}
