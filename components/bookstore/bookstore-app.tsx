"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { MOCK_BOOKS, type Book } from "@/lib/bookstore-data";
import { getOverallPercent, listReadingProgress } from "@/lib/reading-progress";
import { BookCard, BookCover } from "./book-card";
import { BookstoreDetail } from "./bookstore-detail";
import { ReadingView } from "@/components/bookroom/reading-view";

/**
 * 书城模块视图 — 书房内的「统一内容库 / 内容发现中心」（不是普通书专属页面）。
 *
 * 搜索 / 我的书架 / 为你推荐均同时承载普通书（book）与漫画（manga）：
 * 搜索直接过滤全量 MOCK_BOOKS；书架取 inShelf 内容；推荐取未入架内容。
 *
 * 「书城」是「书房」App 内部的一个功能区，不是 Float 系统 App 根节点，
 * 由 BookRoomApp 挂载。内部导航栈（Phase 2A）：
 *   书城首页 ↔ 统一详情（BookstoreDetail）↔ 文字阅读器（ReadingView，仅 type=book）
 * onClose 为退出书房、回到 Float 桌面。
 * 状态栏 / 灵动岛 / 手势区由 Float 系统层提供，这里只负责 App 内容。
 */
export function BookstoreView({ onClose }: { onClose: () => void }) {
    const [activeBook, setActiveBook] = useState<Book | null>(null);
    const [readingBook, setReadingBook] = useState<Book | null>(null);

    if (readingBook) {
        // 阅读器返回统一回到该书详情
        return <ReadingView book={readingBook} onBack={() => setReadingBook(null)} />;
    }
    if (activeBook) {
        return (
            <BookstoreDetail
                book={activeBook}
                onBack={() => setActiveBook(null)}
                onStartReading={book => setReadingBook(book)}
            />
        );
    }
    return (
        <BookstoreHome
            onClose={onClose}
            onOpenBook={setActiveBook}
            onContinueReading={book => setReadingBook(book)}
        />
    );
}

type ContinueInfo = { book: Book; percent: number };

function BookstoreHome({
    onClose,
    onOpenBook,
    onContinueReading,
}: {
    onClose: () => void;
    onOpenBook: (book: Book) => void;
    onContinueReading: (book: Book) => void;
}) {
    const [query, setQuery] = useState("");
    const [continueInfo, setContinueInfo] = useState<ContinueInfo | null>(null);
    const keyword = query.trim().toLowerCase();

    // 「继续阅读」优先接真实阅读进度（kv-db，最近阅读优先）；无记录时回退 mock 默认书
    useEffect(() => {
        const records = listReadingProgress();
        for (const record of records) {
            const book = MOCK_BOOKS.find(item => item.id === record.bookId && item.chapters?.length);
            if (book) {
                setContinueInfo({ book, percent: getOverallPercent(book, record) });
                return;
            }
        }
        const fallback = MOCK_BOOKS.find(book => typeof book.progress === "number") ?? null;
        setContinueInfo(fallback ? { book: fallback, percent: fallback.progress ?? 0 } : null);
    }, []);

    const matchedBooks = useMemo(() => {
        if (!keyword) return null;
        return MOCK_BOOKS.filter(book =>
            book.title.toLowerCase().includes(keyword)
            || book.author.toLowerCase().includes(keyword)
            || book.category.toLowerCase().includes(keyword)
        );
    }, [keyword]);

    const shelfBooks = MOCK_BOOKS.filter(book => book.inShelf).slice(0, 3);
    const recommendedBooks = matchedBooks ?? MOCK_BOOKS.filter(book => !book.inShelf);

    // 有本地章节的普通书点卡片直接进阅读器，其余进详情
    const handleContinueClick = (info: ContinueInfo) => {
        if (info.book.chapters?.length) onContinueReading(info.book);
        else onOpenBook(info.book);
    };

    return (
        <div className="bookstore-app absolute inset-0 z-[100] flex flex-col">
            <header className="book-header">
                <div className="book-appbar">
                    <button className="book-icon-btn book-pressable" type="button" onClick={onClose} aria-label="返回桌面">
                        <ChevronLeft size={22} strokeWidth={2} />
                    </button>
                    <button
                        className="book-icon-btn book-pressable"
                        type="button"
                        aria-label="搜索"
                        onClick={() => document.getElementById("book-search-input")?.focus()}
                    >
                        <Search size={19} strokeWidth={2} />
                    </button>
                </div>
                <div className="book-title-stack">
                    <h1 className="book-title">阅读</h1>
                    <p className="book-subtitle">留一点时间给文字</p>
                </div>
            </header>

            <div className="book-body">
                {/* Search */}
                <div className="book-search book-glass">
                    <Search size={16} strokeWidth={2} className="book-search-icon" />
                    <input
                        id="book-search-input"
                        className="book-search-input"
                        type="text"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="搜索书名、作者或关键词"
                        autoComplete="off"
                    />
                </div>

                {/* Continue Reading */}
                {continueInfo && !keyword && (
                    <section className="book-section">
                        <h2 className="book-section-title">继续阅读</h2>
                        <div className="book-continue book-glass">
                            <button
                                type="button"
                                className="book-continue-cover book-pressable"
                                onClick={() => handleContinueClick(continueInfo)}
                                aria-label={`继续阅读《${continueInfo.book.title}》`}
                            >
                                <BookCover book={continueInfo.book} />
                            </button>
                            <div className="book-continue-info">
                                <span className="book-continue-title">{continueInfo.book.title}</span>
                                <span className="book-continue-author">{continueInfo.book.author}</span>
                                <div className="book-progress">
                                    <div className="book-progress-track">
                                        <div className="book-progress-fill" style={{ width: `${continueInfo.percent}%` }} />
                                    </div>
                                    <span className="book-progress-num">{continueInfo.percent}%</span>
                                </div>
                                <button
                                    type="button"
                                    className="book-cta book-pressable"
                                    onClick={() => handleContinueClick(continueInfo)}
                                >
                                    继续阅读
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* My Bookshelf */}
                {!keyword && (
                    <section className="book-section">
                        <div className="book-section-head">
                            <h2 className="book-section-title">我的书架</h2>
                            <span className="book-section-more">全部</span>
                        </div>
                        <div className="book-shelf-row">
                            {shelfBooks.map(book => (
                                <BookCard key={book.id} book={book} onOpen={onOpenBook} showCategory={false} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Recommended / 搜索结果 */}
                <section className="book-section">
                    <div className="book-section-head">
                        <h2 className="book-section-title">{matchedBooks ? "搜索结果" : "为你推荐"}</h2>
                        {matchedBooks && <span className="book-section-more">{matchedBooks.length} 本</span>}
                    </div>
                    {recommendedBooks.length > 0 ? (
                        <div className="book-grid">
                            {recommendedBooks.map(book => (
                                <BookCard key={book.id} book={book} onOpen={onOpenBook} />
                            ))}
                        </div>
                    ) : (
                        <p className="book-empty">没有找到相关的书，换个关键词试试。</p>
                    )}
                </section>

                <footer className="book-footer">FLOAT READING · PHASE ONE</footer>
            </div>
        </div>
    );
}
