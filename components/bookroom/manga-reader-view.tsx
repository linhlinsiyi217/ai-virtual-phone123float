"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { loadReadingProgress, saveReadingProgress } from "@/lib/reading-progress";
import { markFinished, markReading } from "@/lib/bookroom-shelf";

type Props = {
  book: Book;
  /** 返回：回到漫画详情（不退出书房） */
  onBack: () => void;
};

/**
 * 漫画阅读器（Phase 2B 最小闭环）— 书房内部页面，非 Float 系统 App。
 * 纵向连续滚动，所有分镜页堆叠；复用 reading-progress 持久化：
 *   chapterIndex = 当前锚点页索引，scrollProgress = 整卷纵向滚动比例 0~1。
 * 漫画主体不加玻璃 / 大卡片 / 大圆角 / 强阴影；仅顶/底工具栏轻磨砂。
 */
export function MangaReaderView({ book, onBack }: Props) {
  const pages = book.pages ?? [];
  const total = pages.length;

  const [pageIndex, setPageIndex] = useState(0);
  const [percent, setPercent] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef({ pageIndex: 0, fraction: 0 });
  const restoringRef = useRef(false);

  const persist = () => {
    const fraction = stateRef.current.fraction;
    saveReadingProgress({
      bookId: book.id,
      chapterIndex: stateRef.current.pageIndex,
      scrollProgress: fraction,
    });
    // 完成判定：整卷滚动接近底部 → 标记已读
    if (fraction >= 0.98) markFinished(book.id);
  };

  // 打开漫画阅读器：标记为阅读中
  useEffect(() => {
    markReading(book.id);
  }, [book.id]);

  // 离开 / 切后台时落盘一次最新进度
  useEffect(() => {
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // 首次进入：恢复上次滚动位置
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const saved = loadReadingProgress(book.id);
    restoringRef.current = true;
    const raf = requestAnimationFrame(() => {
      const max = container.scrollHeight - container.clientHeight;
      const fraction = saved ? Math.min(1, Math.max(0, saved.scrollProgress)) : 0;
      container.scrollTop = max > 0 ? fraction * max : 0;
      const pIdx = saved && saved.chapterIndex >= 0 ? saved.chapterIndex : 0;
      const clamped = Math.min(pIdx, Math.max(0, total - 1));
      setPageIndex(clamped);
      setPercent(Math.round(fraction * 100));
      stateRef.current = { pageIndex: clamped, fraction };
      requestAnimationFrame(() => {
        restoringRef.current = false;
      });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  const handleScroll = () => {
    if (restoringRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const max = container.scrollHeight - container.clientHeight;
      const fraction = max > 0 ? container.scrollTop / max : 0;
      // 当前页：视口上 1/4 处最先穿过的分镜页
      const viewportAnchor = container.scrollTop + container.clientHeight * 0.25;
      let current = 0;
      pageRefs.current.forEach((el, idx) => {
        if (el && el.offsetTop <= viewportAnchor) current = idx;
      });
      stateRef.current = { pageIndex: current, fraction };
      setPageIndex(current);
      setPercent(Math.round(fraction * 100));
      persist();
    });
  };

  const flashHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1600);
  };

  return (
    <div className="manga-view br-page">
      <header className="manga-header">
        <button
          className="book-icon-btn book-pressable"
          type="button"
          onClick={onBack}
          aria-label="返回漫画详情"
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <span className="manga-header-title">{book.title}</span>
        <button
          className="book-icon-btn book-pressable"
          type="button"
          aria-label="更多"
          onClick={() => flashHint("更多功能将在后续开放")}
        >
          <SlidersHorizontal size={17} strokeWidth={2} />
        </button>
      </header>

      <div className="manga-content" ref={containerRef} onScroll={handleScroll}>
        {pages.map((page, idx) => (
          <figure
            key={page.id}
            className="manga-page"
            ref={el => {
              pageRefs.current[idx] = el;
            }}
          >
            <img
              src={page.src}
              alt={page.caption ?? `${book.title} 第 ${idx + 1} 页`}
              draggable={false}
            />
          </figure>
        ))}
      </div>

      <footer className="manga-footer">
        <span className="manga-page-info">
          第 {Math.min(pageIndex + 1, Math.max(1, total))} / {total} 页
        </span>
        <span className="manga-percent">{percent}%</span>
      </footer>

      {hint && <div className="br-toast manga-toast">{hint}</div>}
    </div>
  );
}
