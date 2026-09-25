"use client";

import { useState } from "react";
import type { Book, BookCoverTone } from "@/lib/bookstore-data";
import { getCustomCover } from "@/lib/bookroom-shelf";

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
 * Phase 9A：用户自定义封面（书架条目级 customCover）优先级最高。
 */
export function BookCover({ book, className }: { book: Book; className?: string }) {
  const [imgError, setImgError] = useState(false);
  const customCover = getCustomCover(book.id);
  const coverSrc = customCover ?? (book.coverUrl || undefined);
  const hasCoverUrl = Boolean(coverSrc) && !imgError;

  if (hasCoverUrl) {
    return (
      <div className={`book-cover book-cover-photo ${className ?? ""}`}>
        <img
          src={coverSrc}
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

/** 可复用书籍卡片：封面 > 书名 > 作者 > 标签 > 来源，整卡可点进入详情。
 *  Phase 9A：点击时先播“书封轻抬”动效，再进入详情。 */
export function BookCard({ book, onOpen, showCategory = true }: BookCardProps) {
    const [opening, setOpening] = useState(false);
    const isManga = book.type === "manga";
    // 漫画的分类通常也叫「漫画」，此时只保留内容类型标签，避免重复
    const showCategoryTag = showCategory && !(isManga && book.category === "漫画");
    const isExternal = book.source === "external" || Boolean(book.externalId);
    const isImported = book.source === "imported" && Boolean(book.importInfo);

    const handleOpen = () => {
        if (opening) return;
        // reduced-motion 用户直接打开
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            onOpen(book);
            return;
        }
        setOpening(true);
        window.setTimeout(() => onOpen(book), 190);
    };

    return (
        <button
            type="button"
            className={`book-card book-pressable ${opening ? "is-opening" : ""}`}
            onClick={handleOpen}
            aria-label={`查看《${book.title}》详情`}
        >
            <BookCover book={book} />
            <span className="book-card-title">{book.title}</span>
            <span className="book-card-author">{book.author}</span>
            {(isManga || showCategoryTag || isExternal || isImported) && (
                <span className="book-card-tags">
                    {isManga && <span className="book-card-kind">漫画</span>}
                    {showCategoryTag && <span className="book-card-tag">{book.category}</span>}
                    {isExternal && book.externalId && (
                        <span className="book-card-source">{book.externalId.provider}</span>
                    )}
                    {isImported && book.importInfo && (
                        <span className="book-card-source">
                            {book.importInfo.format.toUpperCase()}
                        </span>
                    )}
                </span>
            )}
        </button>
    );
}
