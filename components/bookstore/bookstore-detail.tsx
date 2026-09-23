"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, Plus } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { getOverallPercent, loadReadingProgress } from "@/lib/reading-progress";
import { BookCover } from "./book-card";

type Props = {
    book: Book;
    onBack: () => void;
    /** 进入文字阅读器（仅 type=book 且有本地章节时触发）；漫画 / 无章节内容走占位提示 */
    onStartReading: (book: Book) => void;
};

/**
 * 内容详情（普通书 / 漫画统一详情页）。
 * Phase 2A：type=book 且存在章节时，主按钮真正进入 ReadingView；
 * 其余普通书显示「正文准备中」占位；漫画仍只做占位，不进入任何阅读器。
 */
export function BookstoreDetail({ book, onBack, onStartReading }: Props) {
    const isManga = book.type === "manga";
    const hasChapters = (book.chapters?.length ?? 0) > 0;
    const [inShelf, setInShelf] = useState(book.inShelf ?? false);
    const [hint, setHint] = useState<string | null>(null);
    const [percent, setPercent] = useState(0);

    useEffect(() => {
        setPercent(getOverallPercent(book, loadReadingProgress(book.id)));
    }, [book]);

    const showHint = (text: string) => {
        setHint(text);
        window.setTimeout(() => setHint(null), 1800);
    };

    const handlePrimary = () => {
        if (isManga) {
            showHint("漫画阅读器将在下一阶段接入");
            return;
        }
        if (hasChapters) {
            onStartReading(book);
            return;
        }
        showHint("正文内容准备中");
    };

    const primaryLabel = isManga
        ? "开始看漫画"
        : hasChapters && percent > 0
            ? "继续阅读"
            : "开始阅读";

    return (
        <div className="bookstore-app absolute inset-0 z-[100] flex flex-col">
            <header className="book-header">
                <div className="book-appbar">
                    <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回书城">
                        <ChevronLeft size={22} strokeWidth={2} />
                    </button>
                </div>
            </header>

            <div className="book-body book-detail-body">
                <div className="book-detail-hero">
                    <BookCover book={book} className="book-detail-cover" />
                    <div className="book-detail-meta">
                        <h1 className="book-detail-title">{book.title}</h1>
                        <span className="book-detail-author">{book.author}</span>
                        <span className="book-card-tags">
                            <span className="book-card-kind">{isManga ? "漫画" : "书籍"}</span>
                            {!(isManga && book.category === "漫画") && (
                                <span className="book-card-tag">{book.category}</span>
                            )}
                        </span>
                    </div>
                </div>

                <section className="book-section">
                    <h2 className="book-section-title">简介</h2>
                    <p className="book-detail-desc">{book.description}</p>
                </section>

                <div className="book-detail-actions">
                    <button
                        type="button"
                        className={`book-cta-secondary book-pressable ${inShelf ? "is-active" : ""}`}
                        onClick={() => setInShelf(value => !value)}
                    >
                        {inShelf ? <Check size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2.4} />}
                        {inShelf ? "已在书架" : "加入书架"}
                    </button>
                    <button
                        type="button"
                        className="book-cta book-pressable"
                        onClick={handlePrimary}
                    >
                        {primaryLabel}
                    </button>
                </div>
                <div className="book-detail-hint" aria-live="polite">
                    {hint ? <span className="book-detail-hint-text">{hint}</span> : null}
                </div>

                <footer className="book-footer">FLOAT READING · PHASE ONE</footer>
            </div>
        </div>
    );
}
