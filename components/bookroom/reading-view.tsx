"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { loadReadingProgress, saveReadingProgress } from "@/lib/reading-progress";

type Props = {
    book: Book;
    /** 返回：回到书籍详情（不退出书房） */
    onBack: () => void;
};

/**
 * 普通书文字阅读器（Phase 2A）— 书房内部页面，仅支持纵向连续滚动。
 * 进度（章节 + 章节内滚动百分比）经 kv-db 持久化，再次进入时恢复。
 * 不做分页/翻页动画/阅读设置面板；漫画不进入此视图。
 */
export function ReadingView({ book, onBack }: Props) {
    const chapters = book.chapters ?? [];
    const total = chapters.length;

    const [hint, setHint] = useState(false);
    const [chapterIndex, setChapterIndex] = useState<number>(() => {
        const saved = loadReadingProgress(book.id);
        if (saved && saved.chapterIndex >= 0 && saved.chapterIndex < total) {
            return saved.chapterIndex;
        }
        return 0;
    });
    const [scrollPercent, setScrollPercent] = useState(0);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const restoringRef = useRef(false);
    const stateRef = useRef({ chapterIndex, fraction: 0 });
    stateRef.current.chapterIndex = chapterIndex;

    const persist = (index: number, fraction: number) => {
        const clamped = Math.min(1, Math.max(0, fraction));
        saveReadingProgress({ bookId: book.id, chapterIndex: index, scrollProgress: clamped });
    };

    // 离开 / 切后台时落盘一次最新进度
    useEffect(() => {
        const flush = () => persist(stateRef.current.chapterIndex, stateRef.current.fraction);
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id]);

    // 章节变化（含首次进入）：恢复章节内滚动位置并保存当前章节
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const saved = loadReadingProgress(book.id);
        const target = saved && saved.chapterIndex === chapterIndex ? saved.scrollProgress : 0;
        restoringRef.current = true;
        // 文本渲染同步，下一帧恢复即可
        const raf = requestAnimationFrame(() => {
            const max = container.scrollHeight - container.clientHeight;
            container.scrollTop = max > 0 ? target * max : 0;
            setScrollPercent(Math.round(target * 100));
            stateRef.current.fraction = target;
            // 等这次程序化滚动的 scroll 事件过去后再恢复上报
            requestAnimationFrame(() => { restoringRef.current = false; });
        });
        persist(chapterIndex, target);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapterIndex, book.id]);

    const handleScroll = () => {
        if (restoringRef.current) return;
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const container = scrollRef.current;
            if (!container) return;
            const max = container.scrollHeight - container.clientHeight;
            const fraction = max > 0 ? container.scrollTop / max : 0;
            stateRef.current.fraction = fraction;
            setScrollPercent(Math.round(fraction * 100));
            persist(chapterIndex, fraction);
        });
    };

    const goChapter = (next: number) => {
        if (next < 0 || next >= total || next === chapterIndex) return;
        persist(chapterIndex, stateRef.current.fraction);
        setChapterIndex(next);
    };

    const chapter = chapters[chapterIndex];
    const canPrev = chapterIndex > 0;
    const canNext = chapterIndex < total - 1;

    return (
        <div className="reading-view absolute inset-0 z-[100] flex flex-col">
            <header className="reading-header">
                <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回书籍详情">
                    <ChevronLeft size={22} strokeWidth={2} />
                </button>
                <span className="reading-header-title">{book.title}</span>
                <button
                    className="book-icon-btn book-pressable"
                    type="button"
                    aria-label="阅读设置"
                    onClick={() => {
                        setHint(true);
                        window.setTimeout(() => setHint(false), 1600);
                    }}
                >
                    <SlidersHorizontal size={17} strokeWidth={2} />
                </button>
            </header>

            <div className="reading-content" ref={scrollRef} onScroll={handleScroll}>
                <article className="reading-article">
                    <h2 className="reading-chapter-title">{chapter?.title ?? ""}</h2>
                    {chapter?.content.map((paragraph, i) => (
                        <p className="reading-body-paragraph" key={i}>{paragraph}</p>
                    ))}
                    <div className="reading-chapter-end">
                        {canNext ? "— 本章完 —" : "— 全书完 —"}
                    </div>
                </article>
            </div>

            <footer className="reading-footer">
                <div className="reading-progress-bar">
                    <div className="reading-progress-bar-fill" style={{ width: `${scrollPercent}%` }} />
                </div>
                <div className="reading-footer-row">
                    <button
                        type="button"
                        className="reading-nav-btn book-pressable"
                        onClick={() => goChapter(chapterIndex - 1)}
                        disabled={!canPrev}
                        aria-label="上一章"
                    >
                        <ChevronLeft size={18} strokeWidth={2} />
                        上一章
                    </button>
                    <span className="reading-footer-center">
                        第 {total > 0 ? chapterIndex + 1 : 0} / {total} 章
                        <span className="reading-footer-percent">{scrollPercent}%</span>
                    </span>
                    <button
                        type="button"
                        className="reading-nav-btn book-pressable"
                        onClick={() => goChapter(chapterIndex + 1)}
                        disabled={!canNext}
                        aria-label="下一章"
                    >
                        下一章
                        <ChevronRight size={18} strokeWidth={2} />
                    </button>
                </div>
            </footer>

            {hint && (
                <div className="reading-toast" aria-live="polite">阅读设置后续接入</div>
            )}
        </div>
    );
}
