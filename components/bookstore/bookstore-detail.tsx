"use client";

import { useEffect, useState } from "react";
import { BookMarked, Check, ChevronLeft, Heart, MoonStar, Users } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { getOverallPercent, loadReadingProgress } from "@/lib/reading-progress";
import {
  loadFavoriteIds,
  loadShelfIds,
  toggleFavoriteId,
  toggleShelfId,
} from "@/lib/bookroom-shelf";
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
 * 工具入口按 IA 挂在这里：普通书「开始阅读 / 一起读 / 夜读设置」；
 * 漫画「开始看漫画 / 一起看漫画 / 陪伴设置」。本轮漫画阅读器仍占位。
 */
export function BookstoreDetail({ book, onBack, onStartReading, onCoRead, onNight }: Props) {
  const isManga = book.type === "manga";
  const hasChapters = (book.chapters?.length ?? 0) > 0;
  const [inShelf, setInShelf] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    setPercent(getOverallPercent(book, loadReadingProgress(book.id)));
    setInShelf(loadShelfIds().has(book.id) || Boolean(book.inShelf));
    setFavorite(loadFavoriteIds().has(book.id));
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

  const handleShelfToggle = () => {
    const next = !inShelf;
    toggleShelfId(book.id, next);
    setInShelf(next);
    showHint(next ? "已放上书架" : "已从书架取下");
  };

  const handleFavoriteToggle = () => {
    const next = !favorite;
    toggleFavoriteId(book.id, next);
    setFavorite(next);
    showHint(next ? "已加入收藏" : "已取消收藏");
  };

  const primaryLabel = isManga
    ? "开始看漫画"
    : hasChapters && percent > 0
      ? "继续阅读"
      : "开始阅读";

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
            </span>
          </div>
        </div>

        <section className="book-section">
          <h2 className="book-section-title">简介</h2>
          <p className="book-detail-desc">{book.description}</p>
        </section>

        <div className="br-detail-actions">
          <button type="button" className="book-cta br-detail-primary book-pressable" onClick={handlePrimary}>
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
