"use client";

import { useEffect, useState } from "react";
import { BookMarked, Check, ChevronLeft, ExternalLink, Heart, Loader2, MoonStar, Users } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { getOverallPercent, loadReadingProgress } from "@/lib/reading-progress";
import {
  addToShelf,
  isFavorite,
  isInShelf,
  removeFromShelf,
  saveOnlineSnapshot,
  toggleFavorite as toggleShelfFavorite,
} from "@/lib/bookroom-shelf";
import { fetchFullText } from "@/lib/bookroom/providers";
import { BookCover } from "./book-card";

type Props = {
  book: Book;
  onBack: () => void;
  /** 进入文字阅读器（仅 type=book 且有本地章节时触发）；漫画 / 无章节内容走占位提示 */
  onStartReading: (book: Book) => void;
  /** 一起读 / 一起看漫画（共读半弹层入口） */
  onCoRead: (book: Book) => void;
  /** 夜读设置 / 陪伴设置（半弹层入口） */
  onNight: (book: Book) => void;
};

/**
 * 内容详情（普通书 / 漫画统一详情页）。
 * Phase 4A：支持在线来源结果（真实 metadata + access 状态 + 公版书全文获取）。
 */
export function BookstoreDetail({ book, onBack, onStartReading, onCoRead, onNight }: Props) {
  const isManga = book.type === "manga";
  const hasChapters = (book.chapters?.length ?? 0) > 0;
  const isExternal = book.source === "external" || Boolean(book.externalId);
  const isImported = book.source === "imported" && Boolean(book.importInfo);
  const accessMode = book.access?.mode;
  const [inShelf, setInShelf] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [fetchingText, setFetchingText] = useState(false);

  useEffect(() => {
    setPercent(getOverallPercent(book, loadReadingProgress(book.id)));
    setInShelf(isInShelf(book.id) || Boolean(book.inShelf));
    setFavorite(isFavorite(book.id));
  }, [book]);

  const showHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  };

  const handlePrimary = async () => {
    if (isManga) {
      if (book.pages?.length) {
        onStartReading(book);
        return;
      }
      showHint("漫画内容准备中");
      return;
    }

    // 有本地章节 → 直接阅读
    if (hasChapters) {
      onStartReading(book);
      return;
    }

    // 在线公版书：尝试获取全文
    if (isExternal && accessMode === "full" && book.externalId?.fullTextId) {
      setFetchingText(true);
      try {
        const chapters = await fetchFullText(
          book.externalId.provider,
          book.externalId.fullTextId,
        );
        if (chapters && chapters.length > 0) {
          // 将获取到的章节注入 book 对象
          const bookWithChapters: Book = {
            ...book,
            chapters: chapters.map((ch, i) => ({
              id: `ch-${i}`,
              title: ch.title,
              content: ch.content,
            })),
          };
          onStartReading(bookWithChapters);
          return;
        }
        showHint("未能获取到正文内容");
      } catch {
        showHint("正文加载失败，请稍后重试");
      } finally {
        setFetchingText(false);
      }
      return;
    }

    // 在线 preview / external → 打开外链
    if (isExternal && (accessMode === "preview" || accessMode === "external") && book.access?.url) {
      window.open(book.access.url, "_blank", "noopener,noreferrer");
      return;
    }

    showHint("当前来源仅提供书籍资料");
  };

  const handleShelfToggle = () => {
    const next = !inShelf;
    if (next) {
      const source: "builtin" | "imported" | "online" =
        book.source === "imported"
          ? "imported"
          : book.source === "external" || Boolean(book.externalId)
            ? "online"
            : "builtin";
      addToShelf(book.id, source);
      // 在线书：持久化 metadata 快照（不含正文），供书架列表展示
      if (source === "online") saveOnlineSnapshot(book);
    } else {
      removeFromShelf(book.id);
    }
    setInShelf(next);
    showHint(next ? "已放上书架" : "已从书架取下");
  };

  const handleFavoriteToggle = () => {
    const next = !favorite;
    toggleShelfFavorite(book.id, next);
    setFavorite(next);
    showHint(next ? "已加入收藏" : "已取消收藏");
  };

  // 按钮文案
  let primaryLabel: string;
  if (isManga) {
    primaryLabel = percent > 0 ? "继续看" : "开始看漫画";
  } else if (hasChapters) {
    primaryLabel = percent > 0 ? "继续阅读" : "开始阅读";
  } else if (fetchingText) {
    primaryLabel = "正在获取正文…";
  } else if (accessMode === "full" && book.externalId?.fullTextId) {
    primaryLabel = "开始阅读";
  } else if (accessMode === "preview") {
    primaryLabel = "可预览";
  } else if (accessMode === "external" && book.access?.url) {
    primaryLabel = "前往来源";
  } else {
    primaryLabel = "仅提供书籍资料";
  }

  const canStartReading = hasChapters || (accessMode === "full" && Boolean(book.externalId?.fullTextId)) || (isManga && Boolean(book.pages?.length));
  const canOpenExternal = (accessMode === "preview" || accessMode === "external") && Boolean(book.access?.url);

  return (
    <div className="br-page">
      <header className="book-header">
        <div className="book-appbar">
          <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="book-body book-detail-body br-detail-body">
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
              {isExternal && book.externalId && (
                <span className="book-card-source">{book.externalId.provider}</span>
              )}
            </span>
            {/* 在线出版信息 */}
            {isExternal && (book.publisher || book.publishedDate || book.isbn) && (
              <div className="br-detail-pubinfo">
                {book.publisher && <span>{book.publisher}</span>}
                {book.publishedDate && <span>{book.publishedDate}</span>}
                {book.language && <span>{book.language.toUpperCase()}</span>}
                {book.isbn && book.isbn[0] && <span>ISBN {book.isbn[0]}</span>}
              </div>
            )}
            {/* 导入书信息 */}
            {isImported && book.importInfo && (
              <div className="br-detail-pubinfo">
                <span>{book.importInfo.format.toUpperCase()}</span>
                <span>
                  {new Date(book.importInfo.importedAt).toLocaleDateString("zh-CN")}
                </span>
                {typeof book.importInfo.fileSize === "number" && (
                  <span>
                    {(book.importInfo.fileSize / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <section className="book-section">
          <h2 className="book-section-title">简介</h2>
          <p className="book-detail-desc">
            {book.description || "当前来源未提供简介。"}
          </p>
        </section>

        {/* access 状态提示 */}
        {isExternal && !hasChapters && (
          <div className="br-detail-access">
            {accessMode === "full" && <span className="br-access-badge br-access-full">合法全文可读</span>}
            {accessMode === "preview" && <span className="br-access-badge br-access-preview">可预览</span>}
            {accessMode === "metadata-only" && <span className="br-access-badge br-access-meta">当前来源仅提供书籍资料</span>}
            {accessMode === "external" && !canStartReading && <span className="br-access-badge br-access-external">可前往来源借阅</span>}
          </div>
        )}

        <div className="br-detail-actions">
          <button
            type="button"
            className="book-cta br-detail-primary book-pressable"
            onClick={handlePrimary}
            disabled={fetchingText || (!canStartReading && !canOpenExternal)}
          >
            {fetchingText && <Loader2 size={15} strokeWidth={2} className="br-spin" />}
            {canOpenExternal && !canStartReading && <ExternalLink size={15} strokeWidth={2} />}
            {primaryLabel}
          </button>
          <div className="br-detail-tool-row">
            <button
              type="button"
              className="br-detail-tool book-pressable"
              onClick={() => onCoRead(book)}
            >
              <Users size={15} strokeWidth={2} />
              {isManga ? "一起看漫画" : "一起读"}
            </button>
            <button
              type="button"
              className="br-detail-tool book-pressable"
              onClick={() => onNight(book)}
            >
              <MoonStar size={15} strokeWidth={2} />
              {isManga ? "陪伴设置" : "夜读设置"}
            </button>
          </div>
          <div className="br-detail-quiet-row">
            <button
              type="button"
              className={`br-quiet-btn book-pressable ${favorite ? "is-active" : ""}`}
              onClick={handleFavoriteToggle}
            >
              <Heart size={14} strokeWidth={2} fill={favorite ? "currentColor" : "none"} />
              {favorite ? "已收藏" : "收藏"}
            </button>
            <button
              type="button"
              className={`br-quiet-btn book-pressable ${inShelf ? "is-active" : ""}`}
              onClick={handleShelfToggle}
            >
              {inShelf ? <Check size={14} strokeWidth={2.4} /> : <BookMarked size={14} strokeWidth={2} />}
              {inShelf ? "已在书架" : "加入书架"}
            </button>
          </div>
        </div>
        <div className="book-detail-hint" aria-live="polite">
          {hint ? <span className="book-detail-hint-text">{hint}</span> : null}
        </div>

        <footer className="book-footer">BOOKROOM · DETAIL</footer>
      </div>
    </div>
  );
}
