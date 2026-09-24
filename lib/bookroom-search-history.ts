/**
 * 书城搜索历史（Phase 4A）。
 *
 * 规则：
 * - 只记录用户真实提交过的搜索词（输入或点击历史触发）
 * - 最近使用排序（新插入/重新使用 → 排到最前）
 * - 去重（大小写不敏感）
 * - 上限 30 条，超出自动裁剪最旧的
 * - 持久化到 kv-db（key: bookroom-search-history:v1）
 * - 不上传 AI 记忆，搜索词 ≠ 长期记忆
 */

import { kvGet, kvSet } from "@/lib/kv-db";

const KEY = "bookroom-search-history:v1";
const MAX_ENTRIES = 30;

export type SearchHistoryEntry = {
  term: string;
  /** 最后一次使用的时间戳（ms） */
  updatedAt: number;
};

function loadRaw(): SearchHistoryEntry[] {
  const raw = kvGet(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: unknown): e is SearchHistoryEntry =>
        typeof e === "object" && e !== null && typeof (e as SearchHistoryEntry).term === "string",
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function save(entries: SearchHistoryEntry[]): void {
  kvSet(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/** 加载搜索历史（最近使用优先） */
export function loadSearchHistory(): SearchHistoryEntry[] {
  return loadRaw().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 添加一条搜索词：去重（大小写不敏感）并提到最前。
 * 空字符串或纯空白不记录。
 */
export function addSearchTerm(term: string): SearchHistoryEntry[] {
  const trimmed = term.trim();
  if (!trimmed) return loadSearchHistory();

  const entries = loadRaw();
  const lower = trimmed.toLowerCase();
  const existingIdx = entries.findIndex(e => e.term.toLowerCase() === lower);
  if (existingIdx >= 0) {
    entries.splice(existingIdx, 1);
  }
  entries.unshift({ term: trimmed, updatedAt: Date.now() });
  const result = entries.slice(0, MAX_ENTRIES);
  save(result);
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 删除单条搜索历史（大小写不敏感） */
export function removeSearchTerm(term: string): SearchHistoryEntry[] {
  const entries = loadRaw();
  const lower = term.toLowerCase();
  const filtered = entries.filter(e => e.term.toLowerCase() !== lower);
  save(filtered);
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 清空全部搜索历史 */
export function clearSearchHistory(): void {
  kvSet(KEY, "[]");
}
