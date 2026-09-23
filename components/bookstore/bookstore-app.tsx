"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MOCK_BOOKS, type Book } from "@/lib/bookstore-data";
import { BookCard } from "./book-card";

/**
 * 书城内容区（书房 Dock 内页，不再是独立全屏 App）。
 * 普通书与漫画统一在此发现：搜索、分类浏览、推荐；详情 / 阅读器由
 * BookRoomApp 主壳统一挂载。
 */
export function BookstoreHome({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const keyword = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const set = new Set<string>();
    MOCK_BOOKS.forEach(book => set.add(book.category));
    return ["全部", ...set];
  }, []);

  const matchedBooks = useMemo(() => {
    const byKeyword = keyword
      ? MOCK_BOOKS.filter(book =>
          book.title.toLowerCase().includes(keyword)
          || book.author.toLowerCase().includes(keyword)
          || book.category.toLowerCase().includes(keyword)
        )
      : MOCK_BOOKS;
    return category === "全部" ? byKeyword : byKeyword.filter(book => book.category === category);
  }, [keyword, category]);

  const searching = Boolean(keyword);

  return (
    <>
      {/* 搜索 */}
      <div className="book-search book-glass">
        <Search size={16} strokeWidth={2} className="book-search-icon" />
        <input
          className="book-search-input"
          type="text"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setCategory("全部");
          }}
          placeholder="搜索书名、作者或关键词"
          autoComplete="off"
          aria-label="搜索书与漫画"
        />
      </div>

      {/* 分类浏览 */}
      {!searching && (
        <div className="br-chip-row br-category-row" role="tablist" aria-label="分类浏览">
          {categories.map(item => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              className={`br-chip book-pressable ${category === item ? "is-active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {/* 推荐 / 搜索结果 */}
      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">{searching ? "搜索结果" : "为你推荐"}</h2>
          <span className="book-section-more">{matchedBooks.length} 本</span>
        </div>
        {matchedBooks.length > 0 ? (
          <div className="book-grid">
            {matchedBooks.map(book => (
              <BookCard key={book.id} book={book} onOpen={onOpenBook} />
            ))}
          </div>
        ) : (
          <p className="book-empty">没有找到相关的书或漫画，换个关键词试试。</p>
        )}
      </section>

      <footer className="book-footer">BOOKROOM · STORE</footer>
    </>
  );
}
