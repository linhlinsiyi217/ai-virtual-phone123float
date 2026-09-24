/**
 * 公版书全文获取代理路由（Phase 4A）。
 *
 * 浏览器端无法直接 fetch 外部纯文本 URL（CORS），
 * 通过此路由代理请求 Project Gutenberg 的公版书全文。
 *
 * GET /api/bookroom-fulltext?url=https://www.gutenberg.org/ebooks/1260.txt.utf-8
 *
 * 安全：仅允许 gutenberg.org 域名的 URL，防止 SSRF。
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_HOSTS = ["www.gutenberg.org", "gutenberg.org", "archive.org"];
const TIMEOUT_MS = 20_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  // 安全：仅允许公版书来源域名
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json(
      { error: `Domain not allowed: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BookRoom/1.0 (https://github.com/linhlinsiyi217/ai-virtual-phone123float)",
        "Accept": "text/plain, text/html, */*",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${res.status}` },
        { status: 502 },
      );
    }

    const text = await res.text();
    // Return as plain text (client-side Provider will parse into chapters)
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === "AbortError";
    // Dev fallback：self-hosted 模式下返回样本公版书正文
    if (process.env.NEXT_PUBLIC_SELF_HOSTED_MODE === "1") {
      const sampleText = `*** START OF THE PROJECT GUTENBERG EBOOK JANE EYRE ***

CHAPTER I.

There was no possibility of taking a walk that day. The cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question.

I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse, and humbled by the consciousness of my physical inferiority to Eliza, John, and Georgiana Reed.

CHAPTER II.

I resisted all the way: a new thing for me, and a circumstance which greatly strengthened the bad opinion Bessie and Miss Abbot had of me. I was a trifle beside myself; or rather, out of myself, as the French would say.

I was like any other rebel slave: I felt resolved, in my desperation, to go all lengths. The resistance was not without a sort of wild justice in it.

CHAPTER III.

The next thing I remember is, waking up with a feeling as if I had had a frightful nightmare, and seeing before me a terrible red glare, crossed with thick black bars.

I heard a wild sound of voices, and then all was still. The red room was a spare apartment, and it was in this room that Mr. Reed had breathed his last.

*** END OF THE PROJECT GUTENBERG EBOOK JANE EYRE ***`;
      return new NextResponse(sampleText, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json(
      { error: isAbort ? "timeout" : String(err) },
      { status: isAbort ? 504 : 502 },
    );
  }
}
