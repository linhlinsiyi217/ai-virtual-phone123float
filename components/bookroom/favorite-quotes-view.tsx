"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Quote, Search, Trash2 } from "lucide-react";
import { listShelfEntries, resolveShelfBook } from "@/lib/bookroom-shelf";
import { loadBookAnnotations, deleteBookAnnotation, type ReaderAnnotation } from "@/lib/bookroom-annotations";
import { Segmented, BrToast } from "./bookroom-ui";

type Props = {
  onBack: () => void;
  onJumpToBook: (bookId: string, chapterIndex: number, paragraphIndex: number) => void;
};

type Filter = "all" | "highlight" | "underline" | "note";

const FILTER_LABEL: Record<Filter, string> = {
  all: "全部",
  highlight: "高亮",
  underline: "划线",
  note: "笔记",
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

/**
 * 收藏语录页（Phase 8A）：真实用户标注数据。
 * 来源：阅读器长按菜单的划线 / 高亮 / 笔记。
 */
export function FavoriteQuotesView({ onBack, onJumpToBook }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [toast, setToast] = useState<string | null>(null);

  const shelfEntries = useMemo(() => listShelfEntries(), []);

  // 收集所有标注
  const allAnnotations = useMemo(() => {
    const result: { annotation: ReaderAnnotation; bookTitle: string }[] = [];
    for (const entry of shelfEntries) {
      const book = resolveShelfBook(entry.bookId);
      const title = book?.title ?? entry.bookId;
      const annotations = loadBookAnnotations(entry.bookId);
      for (const ann of annotations) {
        result.push({ annotation: ann, bookTitle: title });
      }
    }
    return result.sort((a, b) => (b.annotation.createdAt ?? 0) - (a.annotation.createdAt ?? 0));
  }, [shelfEntries]);

  const filtered = useMemo(() => {
    let list = allAnnotations;
    if (filter !== "all") {
      list = list.filter(item => item.annotation.type === filter);
    }
    if (bookFilter !== "all") {
      list = list.filter(item => item.annotation.bookId === bookFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(item =>
        item.annotation.quote.toLowerCase().includes(q)
        || item.bookTitle.toLowerCase().includes(q)
        || (item.annotation.note ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allAnnotations, filter, bookFilter, search]);

  const bookOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of shelfEntries) {
      const book = resolveShelfBook(entry.bookId);
      map.set(entry.bookId, book?.title ?? entry.bookId);
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [shelfEntries]);

  const handleDelete = (annotation: ReaderAnnotation) => {
    deleteBookAnnotation(annotation.bookId, annotation.id);
    setToast("已删除");
    window.setTimeout(() => setToast(null), 1500);
    // 触发重新渲染
    setSearch(prev => prev);
  };

  return (
    <div className="br-page br-subpage">
      <header className="book-header">
        <div className="book-appbar">
          <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回我的">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        </div>
        <div className="book-title-stack">
          <h1 className="book-title">收藏语录</h1>
          <p className="book-subtitle">ANNOTATIONS</p>
        </div>
      </header>

      <div className="book-body br-quotes-body">
        {/* 搜索与筛选 */}
        <section className="book-section">
          <div className="br-search-box book-glass">
            <Search size={16} strokeWidth={2} className="br-search-icon" />
            <input
              className="br-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索语录、书名或笔记"
            />
          </div>
          <Segmented<Filter>
            ariaLabel="类型筛选"
            value={filter}
            onChange={setFilter}
            options={(Object.keys(FILTER_LABEL) as Filter[]).map(value => ({
              value,
              label: FILTER_LABEL[value],
            }))}
          />
          {bookOptions.length > 1 && (
            <select
              className="br-field-select"
              value={bookFilter}
              onChange={e => setBookFilter(e.target.value)}
              aria-label="按书筛选"
            >
              <option value="all">全部书籍</option>
              {bookOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.title}</option>
              ))}
            </select>
          )}
        </section>

        {/* 语录列表 */}
        <section className="book-section">
          {filtered.length === 0 ? (
            <div className="br-quotes-empty">
              <Quote size={36} strokeWidth={1.5} />
              <p className="br-quotes-empty-title">
                {allAnnotations.length === 0 ? "还没有收藏语录" : "没有匹配的语录"}
              </p>
              <p className="br-quotes-empty-desc">
                {allAnnotations.length === 0
                  ? "在阅读时长按文字，使用划线、高亮或笔记功能收藏喜欢的句子。"
                  : "尝试更换筛选条件或搜索关键词。"}
              </p>
            </div>
          ) : (
            <div className="br-quote-list">
              {filtered.map(({ annotation, bookTitle }) => (
                <figure key={annotation.id} className="br-quote book-glass">
                  <blockquote className="br-quote-text">{annotation.quote}</blockquote>
                  {annotation.note && (
                    <p className="br-quote-note">{annotation.note}</p>
                  )}
                  <figcaption className="br-quote-meta">
                    <span className="br-quote-source">— {bookTitle}</span>
                    <span className="br-quote-info">
                      {FILTER_LABEL[annotation.type]} · 第 {annotation.chapterIndex + 1} 章 · {formatDate(annotation.createdAt)}
                    </span>
                  </figcaption>
                  <div className="br-quote-actions">
                    <button
                      type="button"
                      className="br-quote-action book-pressable"
                      onClick={() => onJumpToBook(annotation.bookId, annotation.chapterIndex, annotation.paragraphIndex)}
                    >
                      <ChevronRight size={14} strokeWidth={2} />
                      回到原文
                    </button>
                    <button
                      type="button"
                      className="br-quote-action is-danger book-pressable"
                      onClick={() => handleDelete(annotation)}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      删除
                    </button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
      <BrToast text={toast} />
    </div>
  );
}
