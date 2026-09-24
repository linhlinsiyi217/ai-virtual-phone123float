/**
 * Project Gutenberg Provider（Phase 4A 公版书全文来源）。
 *
 * Gutendex API：https://gutendex.com/books?search=...
 * 全文：formats.text/plain 或 formats.text/html
 *
 * 仅返回 copyright=false 的公版书，access.mode 固定 "full"。
 * getFullText 拉取纯文本并按章拆分，供 ReadingView 使用。
 */

import type { BookSearchProvider, BookSearchResult } from "./types";
import { fetchWithTimeout } from "./types";

type GutendexAuthor = {
  name: string;
  birth_year?: number;
  death_year?: number;
};

type GutendexResult = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  subjects?: string[];
  languages?: string[];
  copyright?: boolean;
  media_type?: string;
  formats?: Record<string, string>;
  download_count?: number;
};

type SearchResponse = {
  count: number;
  results: GutendexResult[];
};

const CHAPTER_PATTERNS: RegExp[] = [
  /^CHAPTER\s+[IVXLCDM]+\./im,
  /^CHAPTER\s+\d+/im,
  /^Chapter\s+[IVXLCDM]+/i,
  /^Chapter\s+\d+/i,
  /^[IVXLCDM]+\.\s/m,
  /^\d+\.\s/m,
];

function splitIntoChapters(rawText: string): { title: string; content: string[] }[] {
  const text = rawText.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  // 找到正文起点（跳过 Project Gutenberg 头部）
  let start = 0;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/\*\*\* START OF (THE|THIS) PROJECT GUTENBERG.*\*\*\*/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\*\*\* END OF (THE|THIS) PROJECT GUTENBERG.*\*\*\*/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  const body = lines.slice(start, end).join("\n").trim();
  if (!body) return [];

  // 尝试按章节标题拆分
  for (const pattern of CHAPTER_PATTERNS) {
    const chapterStarts: number[] = [];
    const match = pattern.exec(body);
    if (!match) continue;
    // 找所有匹配位置（使用 exec 循环）
    let lastIndex = -1;
    const globalPattern = new RegExp(pattern.source, "gm");
    let m: RegExpExecArray | null;
    while ((m = globalPattern.exec(body)) !== null) {
      if (m.index > lastIndex) chapterStarts.push(m.index);
      lastIndex = m.index + m[0].length;
    }
    if (chapterStarts.length >= 3) {
      const chapters: { title: string; content: string[] }[] = [];
      chapterStarts.push(body.length);
      for (let i = 0; i < chapterStarts.length - 1; i++) {
        const chunk = body.slice(chapterStarts[i], chapterStarts[i + 1]).trim();
        if (!chunk) continue;
        const firstLine = chunk.split("\n")[0].trim();
        const restLines = chunk.split("\n").slice(1).join("\n").trim();
        const paragraphs = restLines
          .split(/\n\s*\n/)
          .map(p => p.replace(/\n/g, " ").trim())
          .filter(p => p.length > 0);
        if (paragraphs.length > 0) {
          chapters.push({
            title: firstLine.slice(0, 80),
            content: paragraphs,
          });
        }
      }
      if (chapters.length >= 3) return chapters;
    }
  }

  // 回退：按双换行分段，每 20 段一章
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, " ").trim())
    .filter(p => p.length > 20);

  if (paragraphs.length === 0) return [];

  const chunkSize = 20;
  const chapters: { title: string; content: string[] }[] = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    chapters.push({
      title: `Part ${Math.floor(i / chunkSize) + 1}`,
      content: paragraphs.slice(i, i + chunkSize),
    });
  }
  return chapters;
}

export const gutenbergProvider: BookSearchProvider = {
  name: "Gutenberg",
  async search(query: string, signal?: AbortSignal): Promise<BookSearchResult[]> {
    const url = `/api/bookroom-search?q=${encodeURIComponent(query)}&provider=gutenberg`;
    const res = await fetchWithTimeout(url, {}, signal);
    if (!res.ok) throw new Error(`Gutenberg ${res.status}`);
    const data: SearchResponse = await res.json();
    if (!data.results) return [];

    return data.results
      .filter(r => r.copyright === false)
      .slice(0, 10)
      .map<BookSearchResult>(r => {
        const textUrl = r.formats?.["text/plain; charset=us-ascii"] ?? r.formats?.["text/plain"];
        const htmlUrl = r.formats?.["text/html"];
        return {
          provider: "Gutenberg",
          providerId: String(r.id),
          title: r.title,
          authors: r.authors.map(a => a.name),
          description: `Public domain book from Project Gutenberg. ${r.subjects?.slice(0, 3).join(", ") ?? ""}`,
          coverUrl: r.formats?.["image/jpeg"],
          categories: r.subjects?.slice(0, 5),
          publishedDate: undefined,
          publisher: "Project Gutenberg",
          language: r.languages?.[0],
          contentType: "book",
          access: {
            mode: "full",
            url: htmlUrl ?? textUrl,
          },
          fullTextId: textUrl,
        };
      });
  },

  async getFullText(fullTextId: string, signal?: AbortSignal) {
    // fullTextId is the plain text URL — proxy through API route to avoid CORS
    const url = `/api/bookroom-fulltext?url=${encodeURIComponent(fullTextId)}`;
    const res = await fetchWithTimeout(url, {}, signal);
    if (!res.ok) throw new Error(`Gutenberg text ${res.status}`);
    const text = await res.text();
    return splitIntoChapters(text);
  },
};
