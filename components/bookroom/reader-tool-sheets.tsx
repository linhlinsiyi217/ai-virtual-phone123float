"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import type { ReaderAnnotation, ReaderAnnotationColor } from "@/lib/bookroom-annotations";
import { translateBookRoomText, BookRoomAiError } from "@/lib/bookroom-ai-context";
import type { BookTtsStatus } from "@/lib/bookroom-tts";
import { BottomSheet, Segmented } from "./bookroom-ui";

/* ───────────────────────── 笔记 ───────────────────────── */

type NoteSheetProps = {
  quote: string;
  initialNote?: string;
  onSave: (note: string) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function ReaderNoteSheet({ quote, initialNote = "", onSave, onDelete, onClose }: NoteSheetProps) {
  const [text, setText] = useState(initialNote);
  return (
    <BottomSheet title={initialNote ? "编辑笔记" : "写笔记"} onClose={onClose}>
      <blockquote className="reader-note-quote">{quote}</blockquote>
      <textarea
        className="reader-note-input"
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder="写下你此刻的想法……"
        rows={5}
        autoFocus
      />
      <div className="reader-sheet-actions">
        {onDelete && (
          <button type="button" className="reader-ghost-btn book-pressable" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={2} />
            删除
          </button>
        )}
        <button
          type="button"
          className="reader-primary-btn book-pressable"
          disabled={!text.trim()}
          onClick={() => onSave(text.trim())}
        >
          保存
        </button>
      </div>
      <p className="reader-sheet-hint">笔记只保存在本机，不会写入角色的长期记忆。</p>
    </BottomSheet>
  );
}

/* ───────────────────────── 翻译 ───────────────────────── */

type TranslateSheetProps = {
  roleId: string;
  quote: string;
  onCopy: (text: string) => Promise<boolean>;
  onClose: () => void;
};

export function ReaderTranslateSheet({ roleId, quote, onCopy, onClose }: TranslateSheetProps) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [result, setResult] = useState("");
  const [target, setTarget] = useState("");
  const [errorText, setErrorText] = useState("翻译失败，稍后再试。");
  const [copied, setCopied] = useState(false);
  const runIdRef = useRef(0);

  const run = () => {
    const runId = ++runIdRef.current;
    setState("loading");
    setCopied(false);
    translateBookRoomText(roleId, quote)
      .then(res => {
        if (runId !== runIdRef.current) return;
        setResult(res.translation);
        setTarget(res.targetLanguage);
        setState("done");
      })
      .catch(error => {
        if (runId !== runIdRef.current) return;
        if (error instanceof BookRoomAiError && error.code === "aborted") return;
        setErrorText(error instanceof BookRoomAiError ? error.message : "翻译失败，稍后再试。");
        setState("error");
      });
  };

  useEffect(() => {
    run();
    return () => { runIdRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyResult = async () => {
    const ok = await onCopy(result);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <BottomSheet title="翻译" onClose={onClose}>
      <blockquote className="reader-note-quote">{quote}</blockquote>
      {state === "loading" && <p className="reader-sheet-loading">正在翻译…</p>}
      {state === "error" && (
        <div className="reader-sheet-error">
          <span>{errorText}</span>
          <button type="button" className="reader-retry-btn book-pressable" onClick={run}>重试</button>
        </div>
      )}
      {state === "done" && (
        <>
          <p className="reader-translate-target">译文{target ? ` · ${target}` : ""}</p>
          <p className="reader-translate-result">{result}</p>
          <div className="reader-sheet-actions">
            <button type="button" className="reader-primary-btn book-pressable" onClick={copyResult}>
              {copied ? "已复制" : "复制译文"}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

/* ───────────────────────── 书内搜索 ───────────────────────── */

export type ReaderSearchMatch = {
  chapterIndex: number;
  paragraphIndex: number;
  snippet: string;
};

type SearchSheetProps = {
  book: Book;
  initialQuery: string;
  currentChapterIndex: number;
  onJump: (chapterIndex: number, paragraphIndex: number) => void;
  onClose: () => void;
};

const SNIPPET_RADIUS = 16;

function buildSnippet(text: string, index: number, query: string): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function highlightSnippet(snippet: string, query: string) {
  const lower = snippet.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  let at = lower.indexOf(q, cursor);
  while (at >= 0) {
    if (at > cursor) parts.push({ text: snippet.slice(cursor, at), hit: false });
    parts.push({ text: snippet.slice(at, at + query.length), hit: true });
    cursor = at + query.length;
    at = lower.indexOf(q, cursor);
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), hit: false });
  return parts;
}

export function ReaderSearchSheet({ book, initialQuery, currentChapterIndex, onJump, onClose }: SearchSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<"chapter" | "book">("chapter");
  const chapters = useMemo(() => book.chapters ?? [], [book.chapters]);

  const matches = useMemo<ReaderSearchMatch[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const result: ReaderSearchMatch[] = [];
    const range = scope === "chapter"
      ? chapters.map((_, index) => index).filter(index => index === currentChapterIndex)
      : chapters.map((_, index) => index);
    for (const chapterIndex of range) {
      const paragraphs = chapters[chapterIndex]?.content ?? [];
      paragraphs.forEach((text, paragraphIndex) => {
        const lower = text.toLowerCase();
        const ql = q.toLowerCase();
        let at = lower.indexOf(ql);
        while (at >= 0) {
          result.push({ chapterIndex, paragraphIndex, snippet: buildSnippet(text, at, q) });
          at = lower.indexOf(ql, at + ql.length);
        }
      });
    }
    return result.slice(0, 100);
  }, [query, scope, chapters, currentChapterIndex]);

  return (
    <BottomSheet title="书内搜索" onClose={onClose}>
      <input
        className="reader-search-input"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="搜索本书正文…"
        autoFocus
      />
      <Segmented
        ariaLabel="搜索范围"
        value={scope}
        onChange={value => setScope(value)}
        options={[
          { value: "chapter", label: "本章" },
          { value: "book", label: "全书" },
        ]}
      />
      <p className="reader-search-count">{query.trim() ? `${matches.length} 处匹配` : "输入关键字开始搜索"}</p>
      <div className="reader-search-list">
        {matches.map((match, i) => (
          <button
            key={`${match.chapterIndex}-${match.paragraphIndex}-${i}`}
            type="button"
            className="reader-search-item book-pressable"
            onClick={() => onJump(match.chapterIndex, match.paragraphIndex)}
          >
            <span className="reader-search-loc">
              第 {match.chapterIndex + 1} 章 · {chapters[match.chapterIndex]?.title ?? ""}
            </span>
            <span className="reader-search-snippet">
              {highlightSnippet(match.snippet, query.trim()).map((part, j) =>
                part.hit ? <mark key={j} className="reader-search-hit">{part.text}</mark> : <span key={j}>{part.text}</span>,
              )}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/* ───────────────────────── 我的标注 ───────────────────────── */

type AnnotationsSheetProps = {
  book: Book;
  annotations: ReaderAnnotation[];
  onJump: (annotation: ReaderAnnotation) => void;
  onDelete: (annotation: ReaderAnnotation) => void;
  onClose: () => void;
};

const TYPE_LABEL: Record<ReaderAnnotation["type"], string> = {
  underline: "划线",
  highlight: "高亮",
  note: "笔记",
  favorite: "收藏",
};

export function ReaderAnnotationsSheet({ book, annotations, onJump, onDelete, onClose }: AnnotationsSheetProps) {
  const chapters = book.chapters ?? [];
  return (
    <BottomSheet title="我的标注" onClose={onClose}>
      {annotations.length === 0 ? (
        <p className="reader-sheet-empty">还没有标注。长按正文选中文字，就可以划线、高亮或写笔记。</p>
      ) : (
        <div className="reader-ann-list">
          {annotations.map(annotation => (
            <div key={annotation.id} className="reader-ann-item" data-color={annotation.color ?? "yellow"}>
              <button
                type="button"
                className="reader-ann-main book-pressable"
                onClick={() => onJump(annotation)}
              >
                <span className="reader-ann-meta">
                  <i className={`reader-ann-type is-${annotation.type}`}>{TYPE_LABEL[annotation.type]}</i>
                  第 {annotation.chapterIndex + 1} 章 · {chapters[annotation.chapterIndex]?.title ?? ""}
                </span>
                <span className="reader-ann-quote">{annotation.quote}</span>
                {annotation.note ? <span className="reader-ann-note">{annotation.note}</span> : null}
              </button>
              <button
                type="button"
                className="reader-ann-delete book-pressable"
                aria-label="删除标注"
                onClick={() => onDelete(annotation)}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* ───────────────────────── 标注管理（改色 / 笔记 / 删除） ───────────────────────── */

const COLORS: { value: ReaderAnnotationColor; label: string }[] = [
  { value: "blue", label: "冷蓝" },
  { value: "yellow", label: "柔黄" },
  { value: "red", label: "柔红" },
  { value: "green", label: "柔绿" },
];

type ManageSheetProps = {
  annotation: ReaderAnnotation;
  onColor: (color: ReaderAnnotationColor) => void;
  onEditNote: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function ReaderMarkManageSheet({ annotation, onColor, onEditNote, onDelete, onClose }: ManageSheetProps) {
  return (
    <BottomSheet title="标注" onClose={onClose}>
      <blockquote className="reader-note-quote">{annotation.quote}</blockquote>
      {annotation.note ? <p className="reader-ann-note-preview">{annotation.note}</p> : null}
      <div className="reader-color-row">
        {COLORS.map(color => (
          <button
            key={color.value}
            type="button"
            aria-label={color.label}
            className={`reader-color-dot book-pressable is-${color.value} ${annotation.color === color.value ? "is-selected" : ""}`}
            onClick={() => onColor(color.value)}
          />
        ))}
      </div>
      <div className="reader-sheet-actions">
        <button type="button" className="reader-ghost-btn book-pressable" onClick={onEditNote}>
          {annotation.note ? "编辑笔记" : "添加笔记"}
        </button>
        <button type="button" className="reader-ghost-btn is-danger book-pressable" onClick={onDelete}>
          <Trash2 size={14} strokeWidth={2} />
          删除标注
        </button>
      </div>
    </BottomSheet>
  );
}

/* ───────────────────────── 从此听（TTS） ───────────────────────── */

type TtsSheetProps = {
  status: BookTtsStatus;
  paragraphIndex: number;
  rate: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
  onClose: () => void;
};

const RATES: { value: string; label: string }[] = [
  { value: "0.8", label: "0.8x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
];

export function ReaderTtsSheet({ status, paragraphIndex, rate, onPause, onResume, onStop, onRateChange, onClose }: TtsSheetProps) {
  return (
    <BottomSheet title="从此听" onClose={onClose}>
      <p className="reader-tts-status">
        {status === "playing" && paragraphIndex >= 0 ? `正在朗读 · 第 ${paragraphIndex + 1} 段` : status === "paused" ? "已暂停" : "未在朗读"}
      </p>
      <div className="reader-tts-controls">
        {status === "playing" ? (
          <button type="button" className="reader-tts-btn book-pressable" onClick={onPause} aria-label="暂停">
            <Pause size={18} strokeWidth={2} />
          </button>
        ) : (
          <button type="button" className="reader-tts-btn book-pressable" onClick={onResume} aria-label="继续">
            <Play size={18} strokeWidth={2} />
          </button>
        )}
        <button type="button" className="reader-tts-btn book-pressable" onClick={onStop} aria-label="停止">
          <Square size={16} strokeWidth={2} />
        </button>
      </div>
      <Segmented
        ariaLabel="朗读语速"
        value={String(rate)}
        onChange={value => onRateChange(Number(value))}
        options={RATES}
      />
    </BottomSheet>
  );
}
