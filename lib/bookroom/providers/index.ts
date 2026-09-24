/**
 * Provider 聚合层（Phase 4A）。
 *
 * 职责：
 * 1. 并行调用所有 Provider，单 Provider 失败/超时不拖垮其它
 * 2. ISBN 优先去重，无 ISBN 时 title+author 温和去重
 * 3. 本地内置内容与在线结果合并到同一列表
 * 4. 简易内存缓存避免短时间重复查询
 * 5. 返回 providerStatus 供 UI 区分来源失败
 */

import type { AggregatedSearchResult, BookSearchResult, BookSearchProvider } from "./types";
import { SearchCache } from "./types";
import { openLibraryProvider } from "./open-library";
import { googleBooksProvider } from "./google-books";
import { gutenbergProvider } from "./gutenberg";

export type { BookSearchResult, BookSearchProvider, BookAccessMode } from "./types";

/** 所有已注册的在线 Provider */
export const providers: BookSearchProvider[] = [
  openLibraryProvider,
  googleBooksProvider,
  gutenbergProvider,
];

const cache = new SearchCache(60_000);

/**
 * 规范化 title+author 用于去重 key（去标点、空格归一、小写）
 */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 60);
}

function makeIsbnKey(isbns?: string[]): string | null {
  if (!isbns || isbns.length === 0) return null;
  // ISBN-13 优先
  const isbn13 = isbns.find(i => i.length === 13);
  const isbn10 = isbns.find(i => i.length === 10);
  return isbn13 ?? isbn10 ?? null;
}

function makeAuthorKey(authors?: string[]): string {
  if (!authors || authors.length === 0) return "";
  return normalizeKey(authors[0]);
}

/**
 * 去重：ISBN 完全匹配 → 合并（保留信息最全的一条）；
 * 无 ISBN 时 title+author 相同 → 合并。
 * 不合并不同版本（不同 ISBN 且 title 轻微差异）。
 */
function deduplicate(results: BookSearchResult[]): BookSearchResult[] {
  const isbnMap = new Map<string, BookSearchResult>();
  const titleMap = new Map<string, BookSearchResult>();
  const output: BookSearchResult[] = [];

  for (const r of results) {
    const isbnKey = makeIsbnKey(r.isbn);
    if (isbnKey) {
      const existing = isbnMap.get(isbnKey);
      if (existing) {
        // 合并：保留更完整的 description 和 coverUrl
        if (!existing.description && r.description) existing.description = r.description;
        if (!existing.coverUrl && r.coverUrl) existing.coverUrl = r.coverUrl;
        if (!existing.isbn?.length && r.isbn?.length) existing.isbn = r.isbn;
        if ((!existing.categories?.length) && r.categories?.length) existing.categories = r.categories;
        // access 升级：full > preview > metadata-only > external
        const rank: Record<string, number> = { "full": 4, "preview": 3, "external": 2, "metadata-only": 1 };
        if (r.access && rank[r.access.mode] > rank[existing.access?.mode ?? "metadata-only"]) {
          existing.access = r.access;
          if (r.fullTextId) existing.fullTextId = r.fullTextId;
        }
        continue;
      }
      isbnMap.set(isbnKey, r);
      output.push(r);
      continue;
    }

    const titleKey = normalizeKey(r.title);
    const authorKey = makeAuthorKey(r.authors);
    const combinedKey = `${titleKey}|${authorKey}`;
    const existing = titleMap.get(combinedKey);
    if (existing) {
      if (!existing.description && r.description) existing.description = r.description;
      if (!existing.coverUrl && r.coverUrl) existing.coverUrl = r.coverUrl;
      continue;
    }
    titleMap.set(combinedKey, r);
    output.push(r);
  }

  return output;
}

/**
 * 并行调用所有在线 Provider，每个 Provider 独立 try/catch。
 * 返回合并去重后的结果和各 Provider 状态。
 */
export async function searchOnline(
  query: string,
  signal?: AbortSignal,
): Promise<AggregatedSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], providerStatus: {} };

  const cacheKey = `online:${trimmed}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    const status: Record<string, "ok"> = {};
    for (const p of providers) status[p.name] = "ok";
    return { results: cached, providerStatus: status };
  }

  const providerStatus: Record<string, "ok" | "error" | "timeout"> = {};
  const allResults: BookSearchResult[] = [];

  await Promise.allSettled(
    providers.map(async p => {
      try {
        const results = await p.search(trimmed, signal);
        providerStatus[p.name] = "ok";
        allResults.push(...results);
      } catch (err) {
        const name = (err as Error)?.name ?? "";
        providerStatus[p.name] = name === "AbortError" ? "timeout" : "error";
      }
    }),
  );

  const deduped = deduplicate(allResults);
  cache.set(cacheKey, deduped);

  return { results: deduped, providerStatus };
}

/** 清除缓存（搜索历史删除/清空时可选调用） */
export function clearSearchCache(): void {
  cache.clear();
}

/** 暴露 getFullText（供公版书阅读使用） */
export async function fetchFullText(
  providerName: string,
  fullTextId: string,
  signal?: AbortSignal,
): Promise<{ title: string; content: string[] }[] | null> {
  const provider = providers.find(p => p.name === providerName);
  if (!provider?.getFullText) return null;
  return provider.getFullText(fullTextId, signal);
}
