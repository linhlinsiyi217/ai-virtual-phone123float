"use client";

import { useEffect, useMemo, useState } from "react";
import { BookPlus, Trash2 } from "lucide-react";
import { MOCK_BOOKS, type Book, type BookCoverTone } from "@/lib/bookstore-data";
import { deleteReadingProgress, getOverallPercent, listReadingProgress } from "@/lib/reading-progress";
import { loadFavoriteIds, loadShelfIds } from "@/lib/bookroom-shelf";
import { clearBookAnnotations } from "@/lib/bookroom-annotations";
import {
  deleteImportedBook,
  getImportedBookMeta,
  getImportedBookWithChapters,
  listImportedBooks,
} from "@/lib/bookroom-import";
import { BookCard, BookCover } from "@/components/bookstore/book-card";
import { Segmented } from "./bookroom-ui";
import { ImportSheet } from "./import-sheet";

type Props = {
  onOpenBook: (book: Book) => void;
  onContinue: (book: Book) => void;
};

/** 由 id 查找书籍：内置 mock 优先，回退到导入书 meta */
function findBookById(id: string, imported: Book[]): Book | undefined {
  return MOCK_BOOKS.find(item => item.id === id) ?? imported.find(item => item.id === id);
}

/** 格式化导入时间 */
function formatImportedAt(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

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

/** 导入书条目：封面 + 格式标签 + 导入时间 + 进度 + 删除 */
function ImportedItem({
  book,
  onOpen,
  onDelete,
}: {
  book: Book;
  onOpen: (book: Book) => void;
  onDelete: (book: Book) => void;
}) {
  const fmt = book.importInfo?.format?.toUpperCase();
  const date = formatImportedAt(book.importInfo?.importedAt);
  const progress = book.progress ?? 0;
  return (
    <div className="br-imported-item">
      <button
        type="button"
        className="br-imported-cover book-pressable"
        onClick={() => onOpen(book)}
        aria-label={`打开《${book.title}》`}
      >
        <BookCover book={book} />
      </button>
      <div className="br-imported-meta">
        <span className="br-imported-title">{book.title}</span>
        <span className="br-imported-sub">
          {book.author}
        </span>
        <div className="br-imported-tags">
          {fmt && <span className="br-imported-fmt">{fmt}</span>}
          {date && <span className="br-imported-date">{date}</span>}
        </div>
        {progress > 0 && (
          <div className="book-progress">
            <div className="book-progress-track">
              <div className="book-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="book-progress-num">{progress}%</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="br-imported-del book-pressable"
        onClick={() => onDelete(book)}
        aria-label={`删除《${book.title}》`}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

/** 已导入区块内容（spine / cover 共用） */
function ImportedSection({
  books,
  onOpen,
  onDelete,
  onImport,
}: {
  books: Book[];
  onOpen: (book: Book) => void;
  onDelete: (book: Book) => void;
  onImport: () => void;
}) {
  return (
    <ShelfSection title="已导入" count={books.length}>
      {books.length > 0 ? (
        <div className="br-imported-list">
          {books.map(book => (
            <ImportedItem
              key={book.id}
              book={book}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="br-shelf-import book-glass book-pressable"
          onClick={onImport}
        >
          <BookPlus size={18} strokeWidth={1.9} />
          <span>导入书籍</span>
          <span className="br-shelf-import-sub">支持 TXT / EPUB / PDF</span>
        </button>
      )}
    </ShelfSection>
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
  const [imported, setImported] = useState<Book[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);

  const shelfIds = useMemo(loadShelfIds, []);
  const favoriteIds = useMemo(loadFavoriteIds, []);

  const refreshImported = () => setImported(listImportedBooks());

  useEffect(() => {
    refreshImported();
    const records = listReadingProgress();
    const recentBooks: Book[] = [];
    for (const record of records) {
      const book = findBookById(record.bookId, []);
      if (book && !recentBooks.some(item => item.id === book.id)) recentBooks.push(book);
      if (recentBooks.length >= 6) break;
    }
    setRecent(recentBooks);

    for (const record of records) {
      const book = findBookById(record.bookId, imported);
      if (book && (book.chapters?.length || book.pages?.length)) {
        setContinueInfo({ book, percent: getOverallPercent(book, record) });
        return;
      }
    }
    // 导入书虽无内置 chapters（meta 不含），但有解析数据，继续阅读仍可识别
    for (const record of records) {
      const meta = getImportedBookMeta(record.bookId);
      if (meta) {
        setContinueInfo({ book: meta, percent: getOverallPercent(meta, record) });
        return;
      }
    }
    const fallback = MOCK_BOOKS.find(book => typeof book.progress === "number") ?? null;
    setContinueInfo(fallback ? { book: fallback, percent: fallback.progress ?? 0 } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inShelf = (book: Book) => shelfIds.has(book.id) || Boolean(book.inShelf);
  const myBooks = MOCK_BOOKS.filter(book => book.type === "book" && inShelf(book));
  const myManga = MOCK_BOOKS.filter(book => book.type === "manga" && inShelf(book));
  const favorites = MOCK_BOOKS.filter(book => favoriteIds.has(book.id));

  const handleContinueClick = (info: ContinueInfo) => {
    // 导入书：加载章节后进入阅读
    if (info.book.source === "imported") {
      const full = getImportedBookWithChapters(info.book.id);
      if (full && full.chapters?.length) {
        onContinue(full);
        return;
      }
      onOpenBook(info.book);
      return;
    }
    if (info.book.chapters?.length || info.book.pages?.length) onContinue(info.book);
    else onOpenBook(info.book);
  };

  /** 打开导入书：先加载章节（meta 不含正文），再进详情 */
  const openImported = (book: Book) => {
    const full = getImportedBookWithChapters(book.id);
    if (full && full.chapters?.length) onOpenBook(full);
    else onOpenBook(book);
  };

  /** 确认删除导入书：清解析数据 + 进度 + 标注；不删原文件 */
  const handleDeleteImported = (book: Book) => {
    deleteImportedBook(book.id);
    deleteReadingProgress(book.id);
    clearBookAnnotations(book.id);
    setDeleteTarget(null);
    refreshImported();
  };

  const handleImported = (book: Book) => {
    refreshImported();
    setImportOpen(false);
    // 自动跳转到该书详情（已含章节）
    const full = getImportedBookWithChapters(book.id);
    onOpenBook(full ?? book);
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

      {/* 视图切换 + 导入入口 */}
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
        <button
          type="button"
          className="br-shelf-import-entry book-pressable"
          onClick={() => setImportOpen(true)}
          aria-label="导入书籍"
        >
          <BookPlus size={15} strokeWidth={2} />
          <span>导入</span>
        </button>
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
          <ImportedSection
            books={imported}
            onOpen={openImported}
            onDelete={setDeleteTarget}
            onImport={() => setImportOpen(true)}
          />
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
          <ImportedSection
            books={imported}
            onOpen={openImported}
            onDelete={setDeleteTarget}
            onImport={() => setImportOpen(true)}
          />
        </>
      )}

      {/* 导入半弹窗 */}
      {importOpen && (
        <ImportSheet
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      )}

      {/* 删除导入书确认 */}
      {deleteTarget && (
        <div className="br-del-confirm" role="dialog" aria-modal="true" aria-label="删除导入书">
          <button
            type="button"
            className="br-sheet-scrim"
            onClick={() => setDeleteTarget(null)}
            tabIndex={-1}
          />
          <div className="br-del-confirm-panel book-glass">
            <h3 className="br-del-confirm-title">移除《{deleteTarget.title}》</h3>
            <p className="br-del-confirm-text">
              将从书架移除并清除解析内容、阅读进度与标注。
              <br />
              这不会删除你设备上的原文件。
            </p>
            <div className="br-del-confirm-actions">
              <button
                type="button"
                className="br-quiet-btn book-pressable"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="br-del-confirm-yes book-pressable"
                onClick={() => handleDeleteImported(deleteTarget)}
              >
                移除
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="book-footer">BOOKROOM · SHELF</footer>
    </>
  );
}
