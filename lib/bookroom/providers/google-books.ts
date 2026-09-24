/**
 * Google Books Provider（Phase 4A 第二来源）。
 *
 * 公开 API：https://www.googleapis.com/books/v1/volumes?q=...
 * 不需要 API key 即可搜索（有配额限制，足够开发使用）。
 *
 * 归一化为 BookSearchResult。不暴露原始 response 给 UI。
 */

import type { BookSearchProvider, BookSearchResult } from "./types";
import { fetchWithTimeout } from "./types";

type GBVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  categories?: string[];
  publishedDate?: string;
  publisher?: string;
  language?: string;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  previewLink?: string;
  readLink?: string;
  accessInfo?: {
    viewability?: string;
    epub?: { isAvailable?: boolean };
    pdf?: { isAvailable?: boolean };
  };
};

type GBItem = {
  id: string;
  volumeInfo: GBVolumeInfo;
  accessInfo?: {
    viewability?: string;
    embeddable?: boolean;
    epub?: { isAvailable?: boolean };
    pdf?: { isAvailable?: boolean };
    publicDomain?: boolean;
  };
};

type SearchResponse = {
  totalItems: number;
  items?: GBItem[];
};

function pickIsbns(item: GBItem): string[] | undefined {
  const ids = item.volumeInfo.industryIdentifiers;
  if (!ids || ids.length === 0) return undefined;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    const clean = id.identifier.replace(/[^0-9X]/gi, "");
    if (clean.length >= 10 && !seen.has(clean)) {
      seen.add(clean);
      unique.push(clean);
    }
  }
  return unique.length > 0 ? unique.slice(0, 5) : undefined;
}

function resolveAccess(item: GBItem): BookSearchResult["access"] {
  const view = item.accessInfo?.viewability;
  const isPublic = item.accessInfo?.publicDomain === true;
  if (isPublic && (item.accessInfo?.epub?.isAvailable || item.accessInfo?.pdf?.isAvailable)) {
    return {
      mode: "full",
      url: item.volumeInfo.readLink ?? item.volumeInfo.previewLink,
    };
  }
  if (view === "PARTIAL" || view === "ALL_PAGES") {
    return {
      mode: "preview",
      url: item.volumeInfo.previewLink,
    };
  }
  return { mode: "metadata-only" };
}

function upgradeCover(url?: string): string | undefined {
  if (!url) return undefined;
  // Google Books 缩略图默认 edge=curl，去掉后缀获得更清晰的封面
  return url.replace("http://", "https://").replace(/&edge=curl/, "");
}

export const googleBooksProvider: BookSearchProvider = {
  name: "Google Books",
  async search(query: string, signal?: AbortSignal): Promise<BookSearchResult[]> {
    const url = `/api/bookroom-search?q=${encodeURIComponent(query)}&provider=google-books`;
    const res = await fetchWithTimeout(url, {}, signal);
    if (!res.ok) throw new Error(`Google Books ${res.status}`);
    const data: SearchResponse = await res.json();
    if (!data.items) return [];
    return data.items
      .filter(item => item.volumeInfo?.title)
      .map<BookSearchResult>(item => {
        const vi = item.volumeInfo;
        return {
          provider: "Google Books",
          providerId: item.id,
          title: vi.subtitle ? `${vi.title}: ${vi.subtitle}` : vi.title ?? "",
          authors: vi.authors ?? [],
          description: vi.description,
          coverUrl: upgradeCover(vi.imageLinks?.thumbnail ?? vi.imageLinks?.smallThumbnail),
          categories: vi.categories?.slice(0, 5),
          isbn: pickIsbns(item),
          publishedDate: vi.publishedDate,
          publisher: vi.publisher,
          language: vi.language,
          contentType: "book",
          access: resolveAccess(item),
        };
      });
  },
};
