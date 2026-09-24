/**
 * Open Library Provider（Phase 4A 第一真实来源）。
 *
 * 官方公开接口：https://openlibrary.org/dev/rest/api
 * 搜索：https://openlibrary.org/search.json?q=...
 * 封面：https://covers.openlibrary.org/b/id/{cover_i}-M.jpg
 *
 * 不需要 API key。CORS 友好。
 * 归一化为 BookSearchResult，不暴露原始 response 结构给 UI。
 */

import type { BookSearchProvider, BookSearchResult } from "./types";
import { fetchWithTimeout } from "./types";

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  publish_year?: number[];
  publisher?: string[];
  subject?: string[];
  language?: string[];
  ia?: string[];
  has_fulltext?: boolean;
  public_scan_b?: boolean;
  ebook_count_i?: number;
  first_publish_year?: number;
};

type SearchResponse = {
  docs: OpenLibraryDoc[];
};

function pickIsbn(doc: OpenLibraryDoc): string[] | undefined {
  if (!doc.isbn || doc.isbn.length === 0) return undefined;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const isbn of doc.isbn) {
    const clean = isbn.replace(/[^0-9X]/gi, "");
    if (clean.length >= 10 && !seen.has(clean)) {
      seen.add(clean);
      unique.push(clean);
    }
  }
  return unique.length > 0 ? unique.slice(0, 5) : undefined;
}

function detectLanguage(doc: OpenLibraryDoc): string | undefined {
  if (!doc.language || doc.language.length === 0) return undefined;
  const lang = doc.language[0];
  if (lang === "eng") return "en";
  if (lang === "chi") return "zh";
  if (lang === "jpn") return "ja";
  return lang;
}

function resolveAccess(doc: OpenLibraryDoc): BookSearchResult["access"] {
  if (doc.has_fulltext && doc.ia && doc.ia.length > 0) {
    return {
      mode: "external",
      url: `https://archive.org/details/${doc.ia[0]}`,
    };
  }
  return { mode: "metadata-only" };
}

export const openLibraryProvider: BookSearchProvider = {
  name: "Open Library",
  async search(query: string, signal?: AbortSignal): Promise<BookSearchResult[]> {
    const url = `/api/bookroom-search?q=${encodeURIComponent(query)}&provider=open-library`;
    const res = await fetchWithTimeout(url, {}, signal);
    if (!res.ok) throw new Error(`Open Library ${res.status}`);
    const data: SearchResponse = await res.json();
    if (!data.docs) return [];
    return data.docs
      .filter(doc => doc.title)
      .map<BookSearchResult>(doc => ({
        provider: "Open Library",
        providerId: doc.key,
        title: doc.title,
        authors: doc.author_name ?? [],
        description: undefined,
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : undefined,
        categories: doc.subject?.slice(0, 5),
        isbn: pickIsbn(doc),
        publishedDate: doc.first_publish_year?.toString(),
        publisher: doc.publisher?.slice(0, 2).join(", "),
        language: detectLanguage(doc),
        contentType: "book",
        access: resolveAccess(doc),
        fullTextId: doc.ia?.[0],
      }));
  },
};
