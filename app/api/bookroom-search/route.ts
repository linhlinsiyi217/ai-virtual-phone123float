/**
 * 书城在线搜索代理路由（Phase 4A）。
 *
 * 浏览器端 Provider 无法直接访问外部 API（CORS / 网络限制），
 * 通过此服务端路由代理请求，返回原始 JSON 供客户端 Provider 归一化。
 *
 * GET /api/bookroom-search?q=简爱&provider=open-library
 * GET /api/bookroom-search?q=简爱&provider=google-books
 * GET /api/bookroom-search?q=简爱&provider=gutenberg
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVIDER_URLS: Record<string, (q: string) => string> = {
  "open-library": (q) =>
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20&fields=key,title,author_name,isbn,cover_i,publish_year,publisher,subject,language,ia,has_fulltext,public_scan_b,ebook_count_i,first_publish_year`,
  "google-books": (q) =>
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books`,
  "gutenberg": (q) =>
    `https://gutendex.com/books?search=${encodeURIComponent(q)}`,
};

const TIMEOUT_MS = 5_000;

/** Dev fallback：仅 self-hosted 模式下、外部 API 不可达时返回真实结构样本数据 */
const DEV_FALLBACKS: Record<string, (q: string) => unknown> = {
  "open-library": (q) => ({
    docs: [
      {
        key: "/works/OL45804W",
        title: "Jane Eyre",
        author_name: ["Charlotte Brontë"],
        isbn: ["9780141441144", "0141441141"],
        cover_i: 8238556,
        first_publish_year: 1847,
        publisher: ["Penguin Classics"],
        subject: ["Fiction", "Classics", "Romance"],
        language: ["eng"],
        has_fulltext: true,
        ia: ["janeeyre0000brng"],
        public_scan_b: true,
        ebook_count_i: 1,
      },
      {
        key: "/works/OL12345W",
        title: `${q} — 相关作品`,
        author_name: ["Unknown Author"],
        cover_i: 1234567,
        first_publish_year: 1920,
        publisher: ["Example Press"],
        subject: ["Fiction"],
        language: ["eng"],
        has_fulltext: false,
      },
    ],
  }),
  "google-books": (q) => ({
    totalItems: 2,
    items: [
      {
        id: "jane-eyre-gb",
        volumeInfo: {
          title: "Jane Eyre",
          authors: ["Charlotte Brontë"],
          description: "A novel about an orphaned governess who falls in love with her brooding employer.",
          categories: ["Fiction", "Classics"],
          publishedDate: "2006-08-28",
          publisher: "Penguin",
          language: "en",
          imageLinks: { thumbnail: "https://books.google.com/books/content?id=jane-eyre-gb&printsec=frontcover&img=1" },
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9780141441144" }],
          previewLink: "https://books.google.com/books?id=jane-eyre-gb",
        },
        accessInfo: { viewability: "PARTIAL", publicDomain: false, epub: { isAvailable: true }, pdf: { isAvailable: false } },
      },
    ],
  }),
  "gutenberg": (q) => ({
    count: 1,
    results: [
      {
        id: 1260,
        title: "Jane Eyre",
        authors: [{ name: "Brontë, Charlotte", birth_year: 1816, death_year: 1855 }],
        subjects: ["Bildungsromans", "England -- Fiction", "Gothic fiction", "Love stories"],
        languages: ["en"],
        copyright: false,
        media_type: "Text",
        formats: {
          "text/html": "https://www.gutenberg.org/ebooks/1260.html.images",
          "text/plain; charset=us-ascii": "https://www.gutenberg.org/ebooks/1260.txt.utf-8",
        },
        download_count: 50000,
      },
    ],
  }),
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const provider = searchParams.get("provider");

  if (!q || !provider) {
    return NextResponse.json(
      { error: "Missing 'q' or 'provider' parameter" },
      { status: 400 },
    );
  }

  const buildUrl = PROVIDER_URLS[provider];
  if (!buildUrl) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 },
    );
  }

  const externalUrl = buildUrl(q);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(externalUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BookRoom/1.0 (https://github.com/linhlinsiyi217/ai-virtual-phone123float)",
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `${provider} responded ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === "AbortError";
    // Dev fallback：self-hosted 模式下外部 API 不可达时返回样本数据
    if (process.env.NEXT_PUBLIC_SELF_HOSTED_MODE === "1" && DEV_FALLBACKS[provider]) {
      return NextResponse.json(DEV_FALLBACKS[provider](q));
    }
    return NextResponse.json(
      { error: isAbort ? "timeout" : String(err) },
      { status: isAbort ? 504 : 502 },
    );
  }
}
