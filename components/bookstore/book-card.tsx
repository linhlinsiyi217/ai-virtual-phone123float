"use client";

import { useState } from "react";
import type { Book, BookCoverTone } from "@/lib/bookstore-data";

/** 封面 Placeholder 的低饱和纸张色板（无网络图片，纯 CSS 设计感封面） */
const TONE_CLASS: Record<BookCoverTone, string> = {
  paper: "book-cover-tone-paper",
  blue: "book-cover-tone-blue",
  gold: "book-cover-tone-gold",
  clay: "book-cover-tone-clay",
  ink: "book-cover-tone-ink",
  warm: "book-cover-tone-warm",
};

/**
 * 设计感 Placeholder 封面：比例 2/3，纸张纹理 + 极简几何线条。
 * 书名与作者是封面视觉主体。
 * Phase 4A：若 book.coverUrl 存在，优先渲染真实封面 <img>，加载失败回退 placeholder。
 */
export function BookCover({ book, className }: { book: Book; className?: string }) {
  const [imgError, setImgError] = useState(false);
  const hasCoverUrl = Boolean(book.coverUrl) && !imgError;

  if (hasCoverUrl) {
    return (
      <div className={`book-cover book-cover-photo ${className ?? ""}`}>
        <img
          src={book.coverUrl}
          alt={`《${book.title}》封面`}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`book-cover ${TONE_CLASS[book.coverTone]} ${className ?? ""}`} aria-hidden>
      <span className="book-cover-rule" />
      <span className="book-cover-title">{book.title}</span>
      <span className="book-cover-author">{book.author}</span>
      <span className="book-cover-dot" />
    </div>
  );
}

type BookCardProps = {
  book: Book;
  onOpen: (book: Book) => void;
  /** 是否显示分类小标签（推荐列表用） */
  showCategory?: boolean;
};

/** 可复用书籍卡片：封面 > 书名 > 作者 > 标签 > 来源，整卡可点进入详情 */
export function BookCard({ book, onOpen, showCategory = true }: BookCardProps) {
    const isManga = book.type === "manga";
    // 漫画的分类通常也叫「漫画」，此时只保留内容类型标签，避免重复
    const showCategoryTag = showCategory && !(isManga && book.category === "漫画");
    const isExternal = book.source === "external" || Boolean(book.externalId);
    return (
        <button
            type="button"
            className="book-card book-pressable"
            onClick={() => onOpen(book)}
            aria-label={`查看《${book.title}》详情`}
        >
            <BookCover book={book} />
            <span className="book-card-title">{book.title}</span>
            <span className="book-card-author">{book.author}</span>
            {(isManga || showCategoryTag || isExternal) && (
                <span className="book-card-tags">
                    {isManga && <span className="book-card-kind">漫画</span>}
                    {showCategoryTag && <span className="book-card-tag">{book.category}</span>}
                    {isExternal && book.externalId && (
                        <span className="book-card-source">{book.externalId.provider}</span>
                    )}
                </span>
            )}
        </button>
    );
}
