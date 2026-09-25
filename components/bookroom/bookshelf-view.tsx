"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookPlus,
  ChevronDown,
  FolderPlus,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { MOCK_BOOKS, type Book, type BookContentType, type BookCoverTone } from "@/lib/bookstore-data";
import {
  deleteReadingProgress,
  getOverallPercent,
  listReadingProgress,
  type ReadingProgress,
} from "@/lib/reading-progress";
import {
  addToCollection,
  addToShelf,
  createCollection,
  deleteCollection,
  getOnlineSnapshot,
  listCollections,
  listShelfEntries,
  loadShelfOrder,
  markReading,
  removeFromShelf,
  renameCollection,
  saveShelfOrder,
  setShelfStatus,
  toggleFavorite,
  type BookshelfEntry,
  type BookCollection,
  type ShelfStatus,
} from "@/lib/bookroom-shelf";
import {
  clearBookAnnotations,
} from "@/lib/bookroom-annotations";
import {
  deleteImportedBook,
  getImportedBookMeta,
  getImportedBookWithChapters,
} from "@/lib/bookroom-import";
import { BookCard, BookCover } from "@/components/bookstore/book-card";
import { BottomSheet, Segmented } from "./bookroom-ui";
import { ImportSheet } from "./import-sheet";
import { ShelfFocusSheet } from "./shelf-focus-sheet";

type Props = {
  onOpenBook: (book: Book) => void;
  onContinue: (book: Book) => void;
};

type ShelfView =
  | "all"
  | "reading"
  | "unread"
  | "finished"
  | "favorite"
  | "recent"
  | "imported";

type TypeFilter = "all" | BookContentType;

type SortKey =
  | "recent"
  | "added"
  | "title"
  | "author"
  | "progress"
  | "custom";

const VIEW_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "reading", label: "阅读中" },
  { value: "unread", label: "未读" },
  { value: "finished", label: "已读" },
  { value: "favorite", label: "收藏" },
  { value: "recent", label: "最近阅读" },
  { value: "imported", label: "已导入" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "全部内容" },
  { value: "book", label: "书籍" },
  { value: "manga", label: "漫画" },
] as const;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "最近阅读" },
  { value: "added", label: "最近加入" },
  { value: "title", label: "书名" },
  { value: "author", label: "作者" },
  { value: "progress", label: "阅读进度" },
  { value: "custom", label: "自定义" },
];

/* ───────────────────────── 书脊视图 ───────────────────────── */

/* Phase 8B：冷灰 / 冷蓝色板书脊，不使用暖黄木色 */
const SPINE_TONE: Record<BookCoverTone, { bg: string; ink: string }> = {
  paper: { bg: "#e6e9ee", ink: "#4a505c" },
  blue: { bg: "#94a0ad", ink: "#f6f8fb" },
  gold: { bg: "#a8afb8", ink: "#333a44" },
  clay: { bg: "#8e9aad", ink: "#f2f5fa" },
  ink: { bg: "#46494e", ink: "#eceef2" },
  warm: { bg: "#c9cfd6", ink: "#464c55" },
};

function variance(id: string): { width: number; height: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    width: 27 + (hash % 3) * 4,
    height: 96 + ((hash >> 4) % 4) * 7,
  };
}

function BookSpine({
  book,
  percent,
  onSelect,
}: {
  book: Book;
  percent: number;
  onSelect: (book: Book) => void;
}) {
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
      onClick={() => onSelect(book)}
      style={style}
      aria-label={`聚焦《${book.title}》`}
    >
      <span className="br-spine-title">{book.title}</span>
      <span className="br-spine-author">{book.author}</span>
      <span className="br-spine-line" aria-hidden />
      {percent > 0 && (
        <span className="br-spine-progress" style={{ height: `${percent}%` }} />
      )}
    </button>
  );
}

/* ───────────────────────── 工具函数 ───────────────────────── */

/** 由 bookId 解析 Book：builtin→MOCK_BOOKS，imported→kv-db meta，online→snapshot */
function resolveBook(bookId: string): Book | null {
  const builtin = MOCK_BOOKS.find(b => b.id === bookId);
  if (builtin) return builtin;
  const imported = getImportedBookMeta(bookId);
  if (imported) return imported;
  return getOnlineSnapshot(bookId);
}

function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ───────────────────────── 主组件 ───────────────────────── */

export function BookshelfView({ onOpenBook, onContinue }: Props) {
  const [entries, setEntries] = useState<BookshelfEntry[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress>>({});
  const [collections, setCollections] = useState<BookCollection[]>([]);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const [view, setView] = useState<ShelfView>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [search, setSearch] = useState("");
  // Phase 8B：默认真实书架（书脊立在层板上），封面网格为次选
  const [mode, setMode] = useState<"spine" | "cover">("spine");

  // 真实书架：按宽度把书分进每一层架板
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [perTier, setPerTier] = useState(9);
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const calc = () => {
      const w = el.clientWidth - 24;
      setPerTier(Math.max(3, Math.floor((w + 7) / 39)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const [importOpen, setImportOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ book: Book; entry: BookshelfEntry } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ book: Book; kind: "remove" | "delete" } | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  // 拖动排序
  const dragId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const refresh = () => {
    setEntries(listShelfEntries());
    const progs: Record<string, ReadingProgress> = {};
    for (const p of listReadingProgress()) progs[p.bookId] = p;
    setProgressMap(progs);
    setCollections(listCollections());
    setCustomOrder(loadShelfOrder());
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** entry → Book + 进度 */
  const items = useMemo(() => {
    return entries
      .map(e => {
        const book = resolveBook(e.bookId);
        if (!book) return null;
        const progress = progressMap[e.bookId];
        const percent = getOverallPercent(book, progress);
        return { entry: e, book, percent, progress };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [entries, progressMap]);

  /** 一级分类筛选 */
  const viewFiltered = useMemo(() => {
    const now = Date.now();
    return items.filter(({ entry }) => {
      switch (view) {
        case "reading":
          return entry.status === "reading";
        case "unread":
          return entry.status === "unread";
        case "finished":
          return entry.status === "finished";
        case "favorite":
          return Boolean(entry.favorite);
        case "recent":
          return (entry.lastReadAt ?? 0) > 0 && now - (entry.lastReadAt ?? 0) < 1000 * 60 * 60 * 24 * 365;
        case "imported":
          return entry.source === "imported";
        default:
          return true;
      }
    });
  }, [items, view]);

  /** 类型筛选 */
  const typeFiltered = useMemo(() => {
    if (typeFilter === "all") return viewFiltered;
    return viewFiltered.filter(({ book }) => book.type === typeFilter);
  }, [viewFiltered, typeFilter]);

  /** 搜索 */
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return typeFiltered;
    return typeFiltered.filter(({ book, entry }) => {
      const colNames = (entry.collectionIds ?? [])
        .map(id => collections.find(c => c.id === id)?.name ?? "")
        .join(" ");
      const hay = `${book.title} ${book.author} ${book.category} ${colNames}`.toLowerCase();
      return hay.includes(q);
    });
  }, [typeFiltered, search, collections]);

  /** 排序 */
  const sorted = useMemo(() => {
    const arr = [...searched];
    if (sortKey === "custom") {
      const orderMap = new Map<string, number>();
      customOrder.forEach((id, i) => orderMap.set(id, i));
      arr.sort((a, b) => {
        const pa = orderMap.get(a.entry.bookId);
        const pb = orderMap.get(b.entry.bookId);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return (a.entry.addedAt ?? 0) - (b.entry.addedAt ?? 0);
      });
      return arr;
    }
    arr.sort((a, b) => {
      switch (sortKey) {
        case "recent":
          return (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0);
        case "added":
          return (b.entry.addedAt ?? 0) - (a.entry.addedAt ?? 0);
        case "title":
          return a.book.title.localeCompare(b.book.title, "zh");
        case "author":
          return a.book.author.localeCompare(b.book.author, "zh");
        case "progress":
          return b.percent - a.percent;
        default:
          return 0;
      }
    });
    return arr;
  }, [searched, sortKey, customOrder]);

  /** 书架分层：按每层容量切分（仅 spine 模式） */
  const tiers = useMemo(() => {
    if (mode !== "spine") return [];
    const out: typeof sorted[] = [];
    for (let i = 0; i < sorted.length; i += perTier) {
      out.push(sorted.slice(i, i + perTier));
    }
    return out;
  }, [sorted, perTier, mode]);

  /* ───── Continue Reading：阅读中且有进度的最近一本 ───── */
  const continueInfo = useMemo(() => {
    const candidates = items
      .filter(({ entry, percent }) => entry.status === "reading" && percent > 0)
      .sort((a, b) => (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0));
    if (candidates[0]) return candidates[0];
    // 回退：最近阅读且有进度
    const recents = items
      .filter(({ percent }) => percent > 0)
      .sort((a, b) => (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0));
    return recents[0] ?? null;
  }, [items]);

  /* ───── 选中 / 聚焦：不直接跳阅读器 ───── */
  const handleSelect = (book: Book) => {
    const entry = entries.find(e => e.bookId === book.id);
    if (entry) setFocusTarget({ book, entry });
  };

  const handleContinueClick = () => {
    if (!continueInfo) return;
    const { book, entry } = continueInfo;
    markReading(book.id);
    if (entry.source === "imported") {
      const full = getImportedBookWithChapters(book.id);
      onContinue(full ?? book);
    } else {
      onContinue(book);
    }
  };

  const handleReadFromFocus = (book: Book, entry: BookshelfEntry) => {
    markReading(book.id);
    setFocusTarget(null);
    if (entry.source === "imported") {
      const full = getImportedBookWithChapters(book.id);
      onContinue(full ?? book);
    } else {
      onContinue(book);
    }
  };

  const handleFavorite = (bookId: string, favorite: boolean) => {
    toggleFavorite(bookId, favorite);
    refresh();
    if (focusTarget?.entry.bookId === bookId) {
      setFocusTarget({ ...focusTarget, entry: { ...focusTarget.entry, favorite } });
    }
  };

  const handleStatus = (bookId: string, status: ShelfStatus) => {
    setShelfStatus(bookId, status);
    refresh();
    setFocusTarget(null);
  };

  const handleAddToCollection = (bookId: string, collectionId: string) => {
    addToCollection(bookId, collectionId);
    refresh();
  };

  const confirmRemove = (book: Book) => {
    setDeleteTarget({ book, kind: "remove" });
  };

  const confirmDeleteImported = (book: Book) => {
    setDeleteTarget({ book, kind: "delete" });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const { book, kind } = deleteTarget;
    if (kind === "remove") {
      removeFromShelf(book.id);
    } else {
      // 删除导入内容：清 entry + 正文 + 进度 + 标注
      removeFromShelf(book.id);
      deleteImportedBook(book.id);
      deleteReadingProgress(book.id);
      clearBookAnnotations(book.id);
    }
    setDeleteTarget(null);
    setFocusTarget(null);
    refresh();
  };

  const handleImported = (book: Book) => {
    // 导入成功：自动加入书架（entry）
    addToShelf(book.id, "imported");
    refresh();
    setImportOpen(false);
    const full = getImportedBookWithChapters(book.id);
    onOpenBook(full ?? book);
  };

  /* ───── 拖动排序（cover 视图，自定义排序模式） ───── */
  const onDragStart = (id: string) => {
    if (sortKey !== "custom") return;
    dragId.current = id;
    setDraggingId(id);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    if (sortKey !== "custom" || !dragId.current || dragId.current === id) return;
    e.preventDefault();
    const from = customOrder.indexOf(dragId.current);
    const to = customOrder.indexOf(id);
    if (from < 0 || to < 0) return;
    const next = [...customOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCustomOrder(next);
    saveShelfOrder(next);
  };

  const onDragEnd = () => {
    dragId.current = null;
    setDraggingId(null);
  };

  /* ───── 分组管理 ───── */
  const handleCreateCollection = () => {
    const name = window.prompt("新建分组名称");
    if (!name?.trim()) return;
    createCollection(name.trim());
    setCollections(listCollections());
  };

  const handleRenameCollection = (col: BookCollection) => {
    const name = window.prompt("重命名分组", col.name);
    if (!name?.trim()) return;
    renameCollection(col.id, name.trim());
    setCollections(listCollections());
  };

  const handleDeleteCollection = (col: BookCollection) => {
    if (!window.confirm(`删除分组「${col.name}」？分组中的书不会被删除。`)) return;
    deleteCollection(col.id);
    setCollections(listCollections());
    refresh();
  };

  const emptyText: Record<ShelfView, string> = {
    all: "书架还是空的，去书城挑一本，或导入你的书。",
    reading: "还没有正在阅读的书。",
    unread: "没有未读的书。",
    finished: "还没有读完的书。",
    favorite: "还没有收藏内容。",
    recent: "还没有阅读记录。",
    imported: "还没有导入书籍。",
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
              onClick={handleContinueClick}
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
                onClick={handleContinueClick}
              >
                继续阅读
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 紧凑工具区：搜索行 / 横滑分类 chips / 单行工具（Phase 8B 减纵向占用） */}
      <section className="br-shelf-toolbar book-section">
        <div className="br-shelf-searchrow">
          <div className="br-shelf-search">
            <Search size={15} strokeWidth={2} />
            <input
              type="text"
              placeholder="搜索我的书架…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="书架搜索"
            />
            {search && (
              <button
                type="button"
                className="br-shelf-search-clear"
                onClick={() => setSearch("")}
                aria-label="清除搜索"
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="br-shelf-import-entry br-shelf-import-icon book-pressable"
            onClick={() => setImportOpen(true)}
            aria-label="导入书籍"
          >
            <BookPlus size={16} strokeWidth={2.1} />
          </button>
          <Segmented<"spine" | "cover">
            ariaLabel="书架展示模式"
            value={mode}
            onChange={setMode}
            options={[
              { value: "spine", label: "书脊" },
              { value: "cover", label: "封面" },
            ]}
          />
        </div>

        <div className="br-shelf-chips" role="tablist" aria-label="书架分类">
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={view === opt.value}
              className={`br-chip book-pressable ${view === opt.value ? "is-active" : ""}`}
              onClick={() => setView(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="br-shelf-tools">
          <Segmented<TypeFilter>
            ariaLabel="内容类型筛选"
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_OPTIONS as unknown as { value: TypeFilter; label: string }[]}
          />
          <div className="br-shelf-sort">
            <SlidersHorizontal size={13} strokeWidth={2} />
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              aria-label="排序方式"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} strokeWidth={2} />
          </div>
          <button
            type="button"
            className="br-shelf-action book-pressable"
            onClick={handleCreateCollection}
            aria-label="新建分组"
          >
            <FolderPlus size={14} strokeWidth={2} />
          </button>
          {collections.length > 0 && (
            <button
              type="button"
              className="br-shelf-action book-pressable"
              onClick={() => setCollectionsOpen(true)}
              aria-label="管理分组"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </section>

      {/* 书架主体 */}
      {sorted.length === 0 ? (
        <p className="book-empty br-shelf-empty">{emptyText[view]}</p>
      ) : mode === "spine" ? (
        <div className="br-shelf-board" ref={boardRef}>
          {tiers.map((tier, ti) => (
            <div className="br-shelf-tier" key={ti}>
              <div className="br-shelf-spines">
                {tier.map(({ book, percent }) => (
                  <BookSpine key={book.id} book={book} percent={percent} onSelect={handleSelect} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="book-grid br-shelf-grid">
          {sorted.map(({ book, percent, entry }) => (
            <div
              key={book.id}
              className={`br-shelf-card ${draggingId === book.id ? "is-dragging" : ""}`}
              draggable={sortKey === "custom"}
              onDragStart={() => onDragStart(book.id)}
              onDragOver={e => onDragOver(e, book.id)}
              onDragEnd={onDragEnd}
            >
              <BookCard book={book} onOpen={handleSelect} showCategory={false} />
              <div className="br-shelf-card-meta">
                {percent > 0 && (
                  <div className="book-progress book-progress-sm">
                    <div className="book-progress-track">
                      <div className="book-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )}
                <div className="br-shelf-card-badges">
                  {entry.favorite && <span className="br-badge br-badge-fav">♥</span>}
                  {entry.status === "reading" && <span className="br-badge br-badge-reading">在读</span>}
                  {entry.status === "finished" && <span className="br-badge br-badge-done">已读</span>}
                  {entry.source === "imported" && book.importInfo && (
                    <span className="br-badge">{book.importInfo.format.toUpperCase()}</span>
                  )}
                  {entry.lastReadAt && (
                    <span className="br-shelf-card-date">{formatDate(entry.lastReadAt)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="book-footer">BOOKROOM · SHELF</footer>

      {/* 选中书操作面板 */}
      {focusTarget && (
        <ShelfFocusSheet
          book={focusTarget.book}
          entry={focusTarget.entry}
          percent={getOverallPercent(focusTarget.book, progressMap[focusTarget.book.id])}
          onClose={() => setFocusTarget(null)}
          onRead={() => handleReadFromFocus(focusTarget.book, focusTarget.entry)}
          onDetail={() => {
            const b = focusTarget.book;
            setFocusTarget(null);
            if (focusTarget.entry.source === "imported") {
              const full = getImportedBookWithChapters(b.id);
              onOpenBook(full ?? b);
            } else {
              onOpenBook(b);
            }
          }}
          onFavorite={fav => handleFavorite(focusTarget.book.id, fav)}
          onStatus={status => handleStatus(focusTarget.book.id, status)}
          onAddToCollection={colId => handleAddToCollection(focusTarget.book.id, colId)}
          onRemoveFromShelf={() => confirmRemove(focusTarget.book)}
          onDeleteImported={
            focusTarget.book.source === "imported"
              ? () => confirmDeleteImported(focusTarget.book)
              : undefined
          }
        />
      )}

      {/* 导入半弹窗 */}
      {importOpen && (
        <ImportSheet onClose={() => setImportOpen(false)} onImported={handleImported} />
      )}

      {/* 移出 / 删除确认 */}
      {deleteTarget && (
        <div className="br-del-confirm" role="dialog" aria-modal="true" aria-label="确认操作">
          <button
            type="button"
            className="br-sheet-scrim"
            onClick={() => setDeleteTarget(null)}
            tabIndex={-1}
          />
          <div className="br-del-confirm-panel book-glass">
            <h3 className="br-del-confirm-title">
              {deleteTarget.kind === "remove"
                ? `移出书架《${deleteTarget.book.title}》？`
                : `删除导入内容《${deleteTarget.book.title}》？`}
            </h3>
            <p className="br-del-confirm-text">
              {deleteTarget.kind === "remove"
                ? "从书架移除，阅读记录与标注会保留。"
                : "将清除解析内容、阅读进度与标注。不会删除你设备上的原文件。"}
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
                onClick={handleDeleteConfirm}
              >
                {deleteTarget.kind === "remove" ? "移出" : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分组管理半弹窗 */}
      {collectionsOpen && (
        <BottomSheet title="分组管理" onClose={() => setCollectionsOpen(false)}>
          <section className="br-sheet-section">
            {collections.map(col => (
              <div key={col.id} className="br-col-row">
                <span className="br-col-name">{col.name}</span>
                <div className="br-col-actions">
                  <button
                    type="button"
                    className="br-quiet-btn book-pressable"
                    onClick={() => handleRenameCollection(col)}
                  >
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="br-quiet-btn book-pressable is-danger"
                    onClick={() => handleDeleteCollection(col)}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
            {collections.length === 0 && (
              <p className="book-empty">还没有分组。</p>
            )}
            <button
              type="button"
              className="br-sheet-primary book-pressable"
              onClick={handleCreateCollection}
            >
              + 新建分组
            </button>
          </section>
        </BottomSheet>
      )}
    </>
  );
}
