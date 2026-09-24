"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, Trash2, X } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { MOCK_BOOKS } from "@/lib/bookstore-data";
import type { BookSearchResult } from "@/lib/bookroom/providers";
import { searchOnline } from "@/lib/bookroom/providers";
import {
  addSearchTerm,
  clearSearchHistory,
  loadSearchHistory,
  removeSearchTerm,
  type SearchHistoryEntry,
} from "@/lib/bookroom-search-history";
import { BookCard } from "./book-card";

const DEBOUNCE_MS = 300;

/** 将在线搜索结果转换为 BookRoom 内部 Book 模型 */
function searchResultToBook(r: BookSearchResult): Book {
  return {
    id: `${r.provider}:${r.providerId}`,
    title: r.title,
    author: r.authors.length > 0 ? r.authors.join("、") : "未知作者",
    category: r.categories?.[0] ?? "文学",
    type: r.contentType,
    description: r.description ?? "",
    coverTone: "paper",
    source: "external",
    coverUrl: r.coverUrl,
    externalId: { provider: r.provider, id: r.providerId, fullTextId: r.fullTextId },
    access: r.access,
    publishedDate: r.publishedDate,
    publisher: r.publisher,
    language: r.language,
    isbn: r.isbn,
  };
}

type OnlineState = {
  loading: boolean;
  results: Book[];
  providerStatus: Record<string, "ok" | "error" | "timeout">;
};

type Props = { onOpenBook: (book: Book) => void };

/**
 * 书城内容区（书房 Dock 内页）。
 * Phase 4A：本地 mock + 真实在线 Provider 聚合搜索。
 */
export function BookstoreHome({ onOpenBook }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [online, setOnline] = useState<OnlineState>({
    loading: false,
    results: [],
    providerStatus: {},
  });

  const abortRef = useRef<AbortController | null>(null);

  // 加载搜索历史
  useEffect(() => {
    setHistory(loadSearchHistory());
  }, []);

  // debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const keyword = debouncedQuery.toLowerCase();

  // 本地结果（即时）
  const localResults = useMemo(() => {
    if (!debouncedQuery) return [];
    return MOCK_BOOKS.filter(
      book =>
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword) ||
        book.category.toLowerCase().includes(keyword),
    );
  }, [debouncedQuery, keyword]);

  // 在线搜索（debouncedQuery 变化时触发）
  const triggerOnlineSearch = useCallback(async (q: string) => {
    if (!q) {
      setOnline({ loading: false, results: [], providerStatus: {} });
      return;
    }
    // 取消上一个请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOnline(prev => ({ ...prev, loading: true }));

    try {
      const { results, providerStatus } = await searchOnline(q, controller.signal);
      if (controller.signal.aborted) return;
      setOnline({
        loading: false,
        results: results.map(searchResultToBook),
        providerStatus,
      });
    } catch {
      if (!controller.signal.aborted) {
        setOnline({ loading: false, results: [], providerStatus: {} });
      }
    }
  }, []);

  useEffect(() => {
    if (debouncedQuery) {
      setHistory(addSearchTerm(debouncedQuery));
    }
    triggerOnlineSearch(debouncedQuery);
    return () => abortRef.current?.abort();
  }, [debouncedQuery, triggerOnlineSearch]);

  const searching = Boolean(debouncedQuery);
  const showHistoryDropdown = inputFocused && !query && history.length > 0;

  // 合并结果：本地优先 → 在线
  const allResults = useMemo(() => {
    if (!searching) return [];
    const localIds = new Set(localResults.map(b => b.id));
    const onlineNotInLocal = online.results.filter(b => !localIds.has(b.id));
    // 去重在线结果中不同 Provider 的同一本书（已在 provider 层处理，再保险一次）
    return [...localResults, ...onlineNotInLocal];
  }, [searching, localResults, online.results]);

  const total = allResults.length;
  const onlineCount = online.results.length;
  const hasProviderError = Object.values(online.providerStatus).some(s => s === "error" || s === "timeout");
  const allProvidersFailed = searching && !online.loading && onlineCount === 0 && hasProviderError;

  const handleSubmit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setHistory(addSearchTerm(trimmed));
    setInputFocused(false);
  };

  const handleHistoryClick = (term: string) => {
    setQuery(term);
    setHistory(addSearchTerm(term));
    setInputFocused(false);
  };

  const handleHistoryDelete = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(removeSearchTerm(term));
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setHistory([]);
  };

  return (
    <>
      {/* 搜索 */}
      <div className="book-search book-glass">
        <Search size={16} strokeWidth={2} className="book-search-icon" />
        <input
          className="book-search-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setTimeout(() => setInputFocused(false), 150)}
          onKeyDown={e => {
            if (e.key === "Enter") handleSubmit(query);
          }}
          placeholder="搜索书名、作者或关键词"
          autoComplete="off"
          aria-label="搜索书与漫画"
        />
        {query && (
          <button
            type="button"
            className="book-search-clear book-pressable"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
            }}
            aria-label="清除搜索"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* 搜索历史下拉 */}
      {showHistoryDropdown && (
        <div className="br-search-history">
          <div className="br-search-history-head">
            <span className="br-search-history-title">最近搜索</span>
            <button
              type="button"
              className="br-search-history-clear book-pressable"
              onClick={handleClearHistory}
            >
              清空
            </button>
          </div>
          <div className="br-search-history-list">
            {history.map(item => (
              <button
                key={item.term}
                type="button"
                className="br-search-history-item book-pressable"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleHistoryClick(item.term)}
              >
                <Clock size={13} strokeWidth={1.8} className="br-search-history-icon" />
                <span className="br-search-history-term">{item.term}</span>
                <Trash2
                  size={13}
                  strokeWidth={1.6}
                  className="br-search-history-del"
                  onClick={(e) => handleHistoryDelete(item.term, e)}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 推荐（非搜索态） */}
      {!searching && (
        <>
          <RecommendGrid onOpenBook={onOpenBook} />
        </>
      )}

      {/* 搜索结果 */}
      {searching && (
        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">搜索结果</h2>
            <span className="book-section-more">
              {online.loading ? "搜索中…" : `${total} 本`}
            </span>
          </div>

          {/* 本地结果 */}
          {localResults.length > 0 && (
            <div className="book-grid">
              {localResults.map(book => (
                <BookCard key={book.id} book={book} onOpen={onOpenBook} />
              ))}
            </div>
          )}

          {/* 在线来源标签 */}
          {online.loading || onlineCount > 0 ? (
            <div className="br-online-section">
              <div className="br-online-divider">
                <span>在线结果</span>
                {online.loading && <span className="br-online-loading">载入中…</span>}
              </div>
              {onlineCount > 0 && (
                <div className="book-grid">
                  {online.results.map(book => (
                    <BookCard key={book.id} book={book} onOpen={onOpenBook} />
                  ))}
                </div>
              )}
              {/* Provider 状态 */}
              <div className="br-provider-status" aria-live="polite">
                {Object.entries(online.providerStatus).map(([name, status]) => (
                  <span
                    key={name}
                    className={`br-provider-chip br-provider-${status}`}
                  >
                    {name}
                    {status === "ok" ? " ✓" : status === "error" ? " ✕" : " ⏱"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* 全部 Provider 失败 */}
          {allProvidersFailed && (
            <div className="br-search-error">
              <p>在线搜索暂不可用，请稍后重试。</p>
            </div>
          )}

          {/* 无结果 */}
          {!online.loading && total === 0 && !allProvidersFailed && (
            <p className="book-empty">没有找到相关的书或漫画，换个关键词试试。</p>
          )}
        </section>
      )}

      <footer className="book-footer">BOOKROOM · STORE</footer>
    </>
  );
}

/** 推荐列表（非搜索态） */
function RecommendGrid({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [category, setCategory] = useState("全部");

  const categories = useMemo(() => {
    const set = new Set<string>();
    MOCK_BOOKS.forEach(book => set.add(book.category));
    return ["全部", ...set];
  }, []);

  const matchedBooks = useMemo(() => {
    return category === "全部" ? MOCK_BOOKS : MOCK_BOOKS.filter(book => book.category === category);
  }, [category]);

  return (
    <>
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
      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">为你推荐</h2>
          <span className="book-section-more">{matchedBooks.length} 本</span>
        </div>
        <div className="book-grid">
          {matchedBooks.map(book => (
            <BookCard key={book.id} book={book} onOpen={onOpenBook} />
          ))}
        </div>
      </section>
    </>
  );
}
