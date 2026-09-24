/**
 * BookRoom 搜索 Provider 统一接口（Phase 4A）。
 *
 * 第三方 API 请求不散落在 UI 组件中；所有在线书源通过 Provider 层归一化
 * 为 BookSearchResult 后返回，UI 只消费标准模型。
 */

/** 可读状态：决定详情页按钮文案与是否可进入 ReadingView */
export type BookAccessMode = "full" | "preview" | "metadata-only" | "external";

/** 统一搜索结果模型：跨 Provider 标准结构 */
export type BookSearchResult = {
  provider: string;
  providerId: string;
  title: string;
  authors: string[];
  description?: string;
  coverUrl?: string;
  categories?: string[];
  isbn?: string[];
  publishedDate?: string;
  publisher?: string;
  language?: string;
  contentType: "book" | "manga";
  access?: {
    mode: BookAccessMode;
    url?: string;
  };
  /** Provider 原始数据中可用于获取全文的标识（如 Internet Archive ID、Gutenberg ID） */
  fullTextId?: string;
};

/** Provider 统一接口 */
export type BookSearchProvider = {
  /** Provider 唯一名称，用于来源标签 */
  name: string;
  /** 搜索：返回归一化后的结果列表 */
  search(query: string, signal?: AbortSignal): Promise<BookSearchResult[]>;
  /** 可选：按 providerId 获取单本书详情 */
  getBookDetail?(id: string, signal?: AbortSignal): Promise<BookSearchResult | null>;
  /** 可选：按 fullTextId 获取公版书正文（段落数组），供 ReadingView 使用 */
  getFullText?(fullTextId: string, signal?: AbortSignal): Promise<{ title: string; content: string[] }[]>;
};

/** 聚合搜索结果 */
export type AggregatedSearchResult = {
  results: BookSearchResult[];
  /** 各 Provider 单独状态，用于 UI 区分来源失败 */
  providerStatus: Record<string, "ok" | "error" | "timeout">;
};

/** 简易内存缓存（同一 session 内避免重复查询） */
export class SearchCache {
  private map = new Map<string, { ts: number; data: BookSearchResult[] }>();
  private ttlMs: number;

  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  get(key: string): BookSearchResult[] | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: BookSearchResult[]): void {
    this.map.set(key, { ts: Date.now(), data });
  }

  clear(): void {
    this.map.clear();
  }
}

/** fetch 超时 + 取消辅助：合并外部 signal 和内部 timeout */
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  externalSignal?: AbortSignal,
): Promise<Response> {
  const { timeout = 8000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  return fetch(url, { ...rest, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}
