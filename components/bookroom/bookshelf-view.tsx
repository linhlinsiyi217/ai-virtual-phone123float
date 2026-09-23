"use client";

import { useEffect, useMemo, useState } from "react";
import { MOCK_BOOKS, type Book, type BookCoverTone } from "@/lib/bookstore-data";
import { getOverallPercent, listReadingProgress } from "@/lib/reading-progress";
import { loadFavoriteIds, loadShelfIds } from "@/lib/bookroom-shelf";
import { BookCard, BookCover } from "@/components/bookstore/book-card";
import { Segmented } from "./bookroom-ui";

type Props = {
  onOpenBook: (book: Book) => void;
  onContinue: (book: Book) => void;
};

type ShelfMode = "cover" | "spine";

type ContinueInfo = { book: Book; percent: number };

/* 书脊使用去饱和的纸 / 墨灰阶，只保留极轻微色相，维持黑白高级感 */
const SPINE_TONE: Record<BookCoverTone, { bg: string; ink: string }> = {
  paper: { bg: "#e7e4dc", ink: "#4b483f" },
  blue: { bg: "#9aa3ab", ink: "#f4f5f3" },
  gold: { bg: "#c3b89e", ink: "#4d4530" },
  clay: { bg: "#b08f88", ink: "#f7f0ec" },
  ink: { bg: "#4a4946", ink: "#ecebe6" },
  warm: { bg: "#cfc9bd", ink: "#4c473e" },
};

/** 由 id 生成稳定的书脊宽高微差，避免一排书像复制出来的 */
function variance(id: string): { width: number; height: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    width: 27 + (hash % 3) * 4,
    height: 96 + ((hash >> 4) % 4) * 7,
  };
}

function BookSpine({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {
  const tone = SPINE_TONE[book.coverTone];
  const size = variance(book.id);
  const style = {
    "--br-spine-bg": tone.bg,
    "--br-spine-ink": tone.ink,
    width: size.width,
    height: size.height,
  } as React.CSSProperties;
  return (
    <button
      type="button"
      className="br-spine book-pressable"
      onClick={() => onOpen(book)}
      style={style}
      aria-label={`取下《${book.title}》`}
    >
      <span className="br-spine-title">{book.title}</span>
      <span className="br-spine-author">{book.author}</span>
      <span className="br-spine-line" aria-hidden />
    </button>
  );
}

function ShelfBoard({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  return (
    <div className="br-shelf-board">
      <div className="br-shelf-spines">
        {books.map(book => (
          <BookSpine key={book.id} book={book} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function ShelfSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="book-section br-shelf-section">
      <div className="book-section-head">
        <h2 className="book-section-title">{title}</h2>
        {typeof count === "number" && <span className="book-section-more">{count} 本</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * 书架页：真实书房的书架感（封面视图 / 书脊视图）。
 * 承载：继续阅读、最近阅读、我的书、我的漫画、收藏、已导入。
 * 书架/收藏集合读 kv-db（每次挂载重新读取，从详情返回即刷新）。
 */
export function BookshelfView({ onOpenBook, onContinue }: Props) {
  const [mode, setMode] = useState<ShelfMode>("spine");
  const [continueInfo, setContinueInfo] = useState<ContinueInfo | null>(null);
  const [recent, setRecent] = useState<Book[]>([]);

  const shelfIds = useMemo(loadShelfIds, []);
  const favoriteIds = useMemo(loadFavoriteIds, []);

  useEffect(() => {
    const records = listReadingProgress();
    const recentBooks: Book[] = [];
    for (const record of records) {
      const book = MOCK_BOOKS.find(item => item.id === record.bookId);
      if (book && !recentBooks.some(item => item.id === book.id)) recentBooks.push(book);
      if (recentBooks.length >= 6) break;
    }
    setRecent(recentBooks);

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

  const inShelf = (book: Book) => shelfIds.has(book.id) || Boolean(book.inShelf);
  const myBooks = MOCK_BOOKS.filter(book => book.type === "book" && inShelf(book));
  const myManga = MOCK_BOOKS.filter(book => book.type === "manga" && inShelf(book));
  const favorites = MOCK_BOOKS.filter(book => favoriteIds.has(book.id));

  const handleContinueClick = (info: ContinueInfo) => {
    if (info.book.chapters?.length) onContinue(info.book);
    else onOpenBook(info.book);
  };

  return (
    <>
      {/* 继续阅读 */}
      {continueInfo && (
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

      {/* 视图切换 */}
      <section className="book-section br-shelf-switch-row">
        <Segmented<ShelfMode>
          ariaLabel="书架视图切换"
          value={mode}
          onChange={setMode}
          options={[
            { value: "spine", label: "书脊" },
            { value: "cover", label: "封面" },
          ]}
        />
      </section>

      {mode === "spine" ? (
        <>
          {recent.length > 0 && (
            <ShelfSection title="最近阅读">
              <ShelfBoard books={recent} onOpen={onOpenBook} />
            </ShelfSection>
          )}
          <ShelfSection title="我的书" count={myBooks.length}>
            {myBooks.length > 0 ? (
              <ShelfBoard books={myBooks} onOpen={onOpenBook} />
            ) : (
              <p className="book-empty">书架空着，去书城挑一本吧。</p>
            )}
          </ShelfSection>
          <ShelfSection title="我的漫画" count={myManga.length}>
            {myManga.length > 0 ? (
              <ShelfBoard books={myManga} onOpen={onOpenBook} />
            ) : (
              <p className="book-empty">还没有收藏漫画。</p>
            )}
          </ShelfSection>
          <ShelfSection title="收藏" count={favorites.length}>
            {favorites.length > 0 ? (
              <ShelfBoard books={favorites} onOpen={onOpenBook} />
            ) : (
              <p className="book-empty">在详情页点亮爱心，喜欢的书会收在这里。</p>
            )}
          </ShelfSection>
          <ShelfSection title="已导入">
            <div className="br-shelf-import book-glass">
              <span>暂无导入内容</span>
              <span className="br-shelf-import-sub">EPUB / TXT 导入将在后续版本开放</span>
            </div>
          </ShelfSection>
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <ShelfSection title="最近阅读">
              <div className="book-shelf-row">
                {recent.map(book => (
                  <BookCard key={book.id} book={book} onOpen={onOpenBook} showCategory={false} />
                ))}
              </div>
            </ShelfSection>
          )}
          <ShelfSection title="我的书" count={myBooks.length}>
            <div className="book-grid">
              {myBooks.map(book => (
                <BookCard key={book.id} book={book} onOpen={onOpenBook} showCategory={false} />
              ))}
            </div>
          </ShelfSection>
          <ShelfSection title="我的漫画" count={myManga.length}>
            <div className="book-grid">
              {myManga.map(book => (
                <BookCard key={book.id} book={book} onOpen={onOpenBook} showCategory={false} />
              ))}
            </div>
          </ShelfSection>
          <ShelfSection title="收藏" count={favorites.length}>
            <div className="book-grid">
              {favorites.map(book => (
                <BookCard key={book.id} book={book} onOpen={onOpenBook} showCategory={false} />
              ))}
            </div>
          </ShelfSection>
        </>
      )}

      <footer className="book-footer">BOOKROOM · SHELF</footer>
    </>
  );
}
