"use client";

/**
 * BOOKROOM · Bookshelf High-Fidelity V2 实现
 *
 * 设计依据：《BOOKROOM · Bookshelf High-Fidelity V2 修订稿》
 * 核心原则：
 *   - 密度来自"视觉体积的不规则堆叠"而非"更多等高色条"
 *   - 层板内容物混合：标准书脊 + 薄册 + 画册 + 横放书组 + 小型书组 + 书夹 + bookend
 *   - 每层视觉占用 72%–92%，不允许均匀排列
 *   - 书夹 = 真实书本前后错位扇形排列，不是 iOS 九宫格
 *   - 抽书 = Book Wrapper (x/y/scale) + Spine Face / Cover Face (rotateY 交接)
 *   - 光源统一左上 45°，阴影仅存在底部接触层板与背面贴近背板处
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  addToShelf,
  createCollection,
  deleteCollection,
  getOnlineSnapshot,
  getShelfEntry,
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
import { clearBookAnnotations } from "@/lib/bookroom-annotations";
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

/* ═══════════════════════ 书脊类型与确定性尺寸 ═══════════════════════ */

/**
 * V2 层板内容物类型（spec 第一部分）：
 * standard | booklet | artbook | horizontal | cluster | bookend | folder | curated
 */
type SpineType =
  | "standard"   // 标准竖立书脊 14–24px
  | "booklet"    // 薄册 8–12px
  | "artbook"    // 画册/大开本 26–32px, 132–140px
  | "horizontal" // 横放书组 48–64px, 14–18px
  | "cluster"    // 小型书组 20–30px（2–3本薄册）
  | "bookend"    // 极简书立 10–14px
  | "folder"     // 常规书夹 44–72px
  | "curated";   // 收藏夹/世界卷宗 60–72px

type SpineSpec = {
  type: SpineType;
  width: number;   // px
  height: number;  // px
  /** folder / curated 才有：组内书本 id 列表 */
  folderIds?: string[];
  /** 书夹类型标记 */
  folderKind?: "regular" | "curated";
  /** 书夹名称 */
  folderName?: string;
  /** 书夹颜色色点 */
  folderDotColor?: string;
  /** horizontal 才有：书本 id（顶部一本） */
  stackIds?: string[];
  /** cluster 才有：书本 id */
  clusterIds?: string[];
};

/** 确定性 hash：同一 id 每次渲染结果一致 */
function stableHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 标准书脊尺寸 14–24px × 96–128px */
function spineSize(id: string): { w: number; h: number } {
  const hash = stableHash(id);
  return {
    w: 14 + (hash % 11),        // 14–24
    h: 96 + ((hash >> 4) % 33), // 96–128
  };
}

/** 薄册尺寸 8–12px */
function bookletSize(id: string): { w: number; h: number } {
  const hash = stableHash(id);
  return {
    w: 8 + (hash % 5),          // 8–12
    h: 90 + ((hash >> 4) % 20), // 90–109
  };
}

/** 画册尺寸 26–32px × 132–140px */
function artbookSize(id: string): { w: number; h: number } {
  const hash = stableHash(id);
  return {
    w: 26 + (hash % 7),          // 26–32
    h: 132 + ((hash >> 4) % 9),  // 132–140
  };
}

/** 横放书组 48–64px × 14–18px */
function horizontalSize(id: string): { w: number; h: number } {
  const hash = stableHash(id);
  return {
    w: 48 + (hash % 17),        // 48–64
    h: 14 + ((hash >> 4) % 5),  // 14–18
  };
}

/** 小型书组 20–30px */
function clusterSize(id: string): { w: number; h: number } {
  const hash = stableHash(id);
  return {
    w: 20 + (hash % 11),        // 20–30
    h: 86 + ((hash >> 4) % 20), // 86–105
  };
}

/* ═══════════════════════ 莫兰迪色系（无真实封面时的默认底色） ═══════════════════════ */

const MORANDI_PALETTES: { bg: string; ink: string; label: string }[] = [
  { bg: "#C5B9A8", ink: "#4A4238", label: "燕麦" },   // 燕麦米
  { bg: "#A8B5A0", ink: "#3A4438", label: "灰绿" },   // 灰绿
  { bg: "#9BA8B8", ink: "#F2F5FA", label: "灰蓝" },   // 灰蓝
  { bg: "#B8A0A0", ink: "#F5F0F0", label: "灰粉" },   // 灰粉
  { bg: "#8A8A7A", ink: "#F0EDE6", label: "橄榄" },   // 橄榄灰
  { bg: "#A89888", ink: "#F5F2EE", label: "驼灰" },   // 驼灰
  { bg: "#7A8898", ink: "#ECEFF5", label: "黛蓝" },   // 黛蓝灰
  { bg: "#B0A898", ink: "#3E3A32", label: "亚麻" },   // 亚麻灰
];

function morandiPalette(id: string) {
  const hash = stableHash(id);
  return MORANDI_PALETTES[hash % MORANDI_PALETTES.length];
}

/* ═══════════════════════ 书脊颜色提取 ═══════════════════════ */

/**
 * V2 书脊颜色规则：
 * - 有真实封面：从封面边缘提取主色，降饱和 30–40%
 * - 无真实封面：使用 coverTone 映射的低饱和色
 *
 * 简化实现：由于无法运行时真正做 canvas 颜色提取，
 * 用 coverTone 到 Morandi 色系的确定性映射，同时保证
 * 同一封面颜色在书架上的书脊颜色稳定。
 */
const SPINE_TONE: Record<BookCoverTone, { bg: string; ink: string }> = {
  paper: { bg: "#E8E4DC", ink: "#5A5248" },
  blue:  { bg: "#8A9AAD", ink: "#F0F4FA" },
  gold:  { bg: "#A8A090", ink: "#F5F2EE" },
  clay:  { bg: "#8A9AAD", ink: "#F2F5FA" },
  ink:   { bg: "#4A4E55", ink: "#ECEEF2" },
  warm:  { bg: "#C9CFD6", ink: "#464C55" },
};

/** Night Pearl 模式下的书脊色 */
const SPINE_TONE_DARK: Record<BookCoverTone, { bg: string; ink: string }> = {
  paper: { bg: "#3A3A3E", ink: "#B8B4AC" },
  blue:  { bg: "#3A4550", ink: "#A0AEBE" },
  gold:  { bg: "#4A4538", ink: "#C0B8A8" },
  clay:  { bg: "#3A4550", ink: "#B0BEC8" },
  ink:   { bg: "#2A2A2E", ink: "#888A90" },
  warm:  { bg: "#484C52", ink: "#A8ACB2" },
};

/* ═══════════════════════ 工具函数 ═══════════════════════ */

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

/** 判断是否为深色模式 */
function isDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 判断 reduced motion */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ═══════════════════════ 单个书脊组件 ═══════════════════════ */

type BookSpineProps = {
  book: Book;
  percent: number;
  spineType: SpineType;
  width: number;
  height: number;
  onSelect: (book: Book) => void;
};

/**
 * V2 书脊：物理实体书，不是 colored div。
 * - 左侧 1px 极弱受光高光（光源左上 45°）
 * - 右侧 2–3px 纸张切面
 * - 底部接触层板阴影
 * - 背面贴近背板的 2px 极弱空间阴影（几乎不可察觉，制造进深感）
 * - 顶部轻微装订倒角 1–2px
 * - 无四周 card shadow
 */
function BookSpineV2({ book, percent, spineType, width, height, onSelect }: BookSpineProps) {
  const dark = isDarkMode();
  const tone = dark ? SPINE_TONE_DARK[book.coverTone] : SPINE_TONE[book.coverTone];
  const palette = morandiPalette(book.id);

  const isNarrow = width < 18;
  const isThin = spineType === "booklet";

  const style: React.CSSProperties = {
    width,
    height,
    "--spine-bg": tone.bg,
    "--spine-ink": tone.ink,
    "--spine-palette-bg": palette.bg,
  } as React.CSSProperties;

  // 窄书脊不显示文字（V2 第 18 条）
  const showTitle = !isNarrow && !isThin;

  return (
    <button
      type="button"
      className={`br2-spine br2-spine-${spineType}`}
      onClick={() => onSelect(book)}
      style={style}
      aria-label={`《${book.title}》${book.author}`}
    >
      {/* 左侧 1px 极弱受光高光（光源左上 45°） */}
      <span className="br2-spine-hl" aria-hidden />
      {/* 右侧 2–3px 纸张切面 */}
      <span className="br2-spine-edge" aria-hidden />
      {/* 顶部装订倒角 */}
      <span className="br2-spine-top" aria-hidden />
      {/* 底部接触层板阴影 */}
      <span className="br2-spine-shadow" aria-hidden />
      {/* 背面贴近背板的 2px 极弱空间阴影 */}
      <span className="br2-spine-back" aria-hidden />

      {showTitle && (
        <>
          <span className="br2-spine-title">{book.title}</span>
          <span className="br2-spine-author">{book.author}</span>
        </>
      )}
      {isThin && (
        <span className="br2-spine-dot" aria-hidden />
      )}
      {percent > 0 && (
        <span className="br2-spine-progress" style={{ height: `${percent}%` }} aria-hidden />
      )}
    </button>
  );
}

/* ═══════════════════════ 横放书组 ═══════════════════════ */

type HorizontalStackProps = {
  books: Book[];
  onSelect: (book: Book) => void;
};

function HorizontalStack({ books, onSelect }: HorizontalStackProps) {
  const first = books[0];
  const size = horizontalSize(first.id);
  return (
    <button
      type="button"
      className="br2-horizontal"
      style={{ width: size.w, height: size.h }}
      onClick={() => onSelect(first)}
      aria-label={`《${first.title}》横放`}
    >
      {books.slice(0, 2).map((b, i) => {
        const t = isDarkMode() ? SPINE_TONE_DARK[b.coverTone] : SPINE_TONE[b.coverTone];
        return (
          <span
            key={b.id}
            className="br2-horizontal-book"
            style={{
              "--spine-bg": t.bg,
              width: `${100 - i * 4}%`,
              height: `${Math.round(100 / books.length)}%`,
              bottom: `${i * Math.round(100 / books.length)}%`,
            } as React.CSSProperties}
            aria-hidden={i > 0}
          />
        );
      })}
      {/* 扁平厚重接触阴影（横放书接触面积大，阴影更宽更柔和） */}
      <span className="br2-horizontal-shadow" aria-hidden />
    </button>
  );
}

/* ═══════════════════════ 书夹（Folder）V2 ═══════════════════════ */

type FolderProps = {
  folder: SpineSpec;
  books: Book[];
  dark: boolean;
  onOpen: (book: Book) => void;
};

/**
 * V2 常规书夹：3–5 本真实书脊前后错位扇形排列。
 * - 总宽 44–72px（推荐 4 本约 52px）
 * - 前一本完整站立，后方每本偏移 6–8px，高度递减 3–4px
 * - 标签极小，视觉权重必须低于书本本体
 * - 数量 >5 才显示 +N
 */
function BookFolder({ folder, books, dark, onOpen }: FolderProps) {
  const folderBooks = books.slice(0, 5);
  const count = folderBooks.length;
  const showBadge = count > 5;

  // 宽度：基础 44px + 每多一本 +8px
  const width = 44 + (count - 3) * 8;
  // 最大高度（第一本）
  const maxH = 96 + (stableHash(folder.folderIds?.[0] ?? "f") % 20);

  return (
    <div
      className="br2-folder"
      style={{ width, height: maxH + 16 }}
      role="group"
      aria-label={folder.folderName ?? "书夹"}
    >
      {/* 书夹标签（视觉权重低于书本） */}
      <span className="br2-folder-label" aria-hidden>
        {folder.folderName?.slice(0, 4) ?? "合集"}
      </span>
      {/* 数量角标 */}
      {showBadge && (
        <span className="br2-folder-badge" aria-hidden>+{count - 5}</span>
      )}
      {/* 书本本体：从后往前渲染（后面的在底层） */}
      {folderBooks.map((book, i) => {
        const isFirst = i === 0;
        const offset = i * 7; // 6–8px 偏移
        const h = maxH - i * 3.5; // 高度递减
        const w = spineSize(book.id).w;
        const tone = dark ? SPINE_TONE_DARK[book.coverTone] : SPINE_TONE[book.coverTone];
        return (
          <button
            key={book.id}
            type="button"
            className="br2-folder-book"
            style={{
              width: w,
              height: h,
              left: offset,
              bottom: 0,
              zIndex: folderBooks.length - i,
              "--spine-bg": tone.bg,
              "--spine-ink": tone.ink,
            } as React.CSSProperties}
            onClick={() => onOpen(book)}
            aria-label={`《${book.title}》`}
          >
            {/* 第一本书显示书脊标题 */}
            {isFirst && w >= 17 && (
              <span className="br2-folder-book-title">{book.title}</span>
            )}
            {/* 左侧受光高光 */}
            <span className="br2-spine-hl" aria-hidden />
            {/* 右侧切面 */}
            <span className="br2-spine-edge" aria-hidden />
          </button>
        );
      })}
      {/* 可选：前置横放书 */}
      {folder.folderKind === "regular" && count >= 4 && (
        <span
          className="br2-folder-front-stack"
          style={{
            width: Math.min(52, width - 8),
            height: 14,
            bottom: -2,
            left: 4,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * V2 收藏夹 / 世界卷宗式书夹（Curated Folder）。
 * 在常规书夹基础上强化策展感：
 * - 总宽 60–72px
 * - 允许 1 本横放压顶（卷宗封面式）
 * - 标签更宽（18px），含分类色点 + 完整合集标题
 * - 组内书可共享低饱和同色相家族
 * - 阴影比常规书夹高一档
 */
function CuratedFolder({ folder, books, dark, onOpen }: FolderProps) {
  const folderBooks = books.slice(0, 5);
  const count = folderBooks.length;
  const width = 60 + (count > 4 ? 6 : 0);
  const maxH = 100 + (stableHash(folder.folderIds?.[0] ?? "c") % 15);

  // 共享低饱和色相家族（使用第一本书的色调作为基准）
  const baseTone = dark
    ? SPINE_TONE_DARK[folderBooks[0]?.coverTone ?? "paper"]
    : SPINE_TONE[folderBooks[0]?.coverTone ?? "paper"];

  return (
    <div
      className="br2-folder br2-folder-curated"
      style={{ width, height: maxH + 20 }}
      role="group"
      aria-label={folder.folderName ?? "收藏夹"}
    >
      {/* 横放压顶书（卷宗封面） */}
      {folderBooks.length >= 3 && (
        <span
          className="br2-folder-top-stack"
          style={{
            width: width - 20,
            height: 12,
            top: 0,
            left: 10,
            "--spine-bg": baseTone.bg,
          } as React.CSSProperties}
          aria-hidden
        />
      )}
      {/* 标签：更宽，含色点 */}
      <span className="br2-folder-label br2-folder-label-curated" aria-hidden>
        <span
          className="br2-folder-dot"
          style={{ background: folder.folderDotColor ?? baseTone.bg }}
          aria-hidden
        />
        {folder.folderName ?? "合集"}
      </span>
      {showBadge(count) && (
        <span className="br2-folder-badge" aria-hidden>+{count - 5}</span>
      )}
      {folderBooks.map((book, i) => {
        const offset = i * 7;
        const h = maxH - i * 3.5;
        const w = spineSize(book.id).w;
        // 收藏夹使用同色相家族
        const tone = dark ? SPINE_TONE_DARK[book.coverTone] : SPINE_TONE[book.coverTone];
        return (
          <button
            key={book.id}
            type="button"
            className="br2-folder-book"
            style={{
              width: w,
              height: h,
              left: offset,
              bottom: 0,
              zIndex: folderBooks.length - i,
              "--spine-bg": tone.bg,
              "--spine-ink": tone.ink,
            } as React.CSSProperties}
            onClick={() => onOpen(book)}
            aria-label={`《${book.title}》`}
          >
            {i === 0 && w >= 17 && (
              <span className="br2-folder-book-title">{book.title}</span>
            )}
            <span className="br2-spine-hl" aria-hidden />
            <span className="br2-spine-edge" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function showBadge(count: number): boolean {
  return count > 5;
}

/* ═══════════════════════ Bookend（书立摆件） ═══════════════════════ */

function Bookend() {
  return (
    <span className="br2-bookend" aria-hidden>
      <svg width="12" height="60" viewBox="0 0 12 60" fill="none">
        {/* 极简线性几何摆件 */}
        <path
          d="M6 4 L6 56 M2 56 L10 56"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/* ═══════════════════════ 纸签（Sparse Shelf） ═══════════════════════ */

function PaperTag({ text }: { text: string }) {
  return (
    <span className="br2-paper-tag" aria-hidden>
      {text}
    </span>
  );
}

/* ═══════════════════════ FLIP 抽书动画组件 ═══════════════════════ */

type PullOutState = {
  book: Book;
  entry: BookshelfEntry;
  spineEl: HTMLElement;
  spineRect: DOMRect;
  stage: "idle" | "touch" | "pull" | "rotate" | "expand" | "detail";
};

/**
 * V2 抽书动画（FLIP + Spine/Cover Face 交接）
 *
 * 阶段：
 * 1. Touch Down: 80ms, scale(1→0.98)
 * 2. Pull-out: 180ms, translateY(0→-10px), rotate(0→-3deg), scale(0.98→1.05)
 * 3. Y-axis Light Rotate: 200ms, translateY(-10→-28px), rotate(-3→0), rotateY(0→18deg), scale(1.05→1.15)
 * 4. Cover Takeover: 260ms, rotateY(18→0), position to detail anchor, scale uniform
 *    - spine/cover face 交叉 opacity 在 rotateY ~35-40° 时切换
 * 5. Detail: 底部生长详情区域
 * 6. Return: 反向执行 3-4，cover face 淡出，spine face 淡入
 *
 * 关键约束：
 * - Book Wrapper 只做 x/y/scale（uniform），不做 scaleX != scaleY
 * - rotateY 最大 18°（阶段3中间态），perspective 700px
 * - 真实封面 → cover face 直接渲染真实封面
 * - 无真实封面 → cover face 渲染程序生成默认封面（莫兰迪色系）
 */
function usePullOutAnimation() {
  const [state, setState] = useState<PullOutState | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const reducedMotion = prefersReducedMotion();

  const openDetail = useCallback((book: Book, entry: BookshelfEntry, spineEl: HTMLElement) => {
    const spineRect = spineEl.getBoundingClientRect();

    if (reducedMotion) {
      // reduced-motion：直接 160ms cross-fade
      setState({ book, entry, spineEl, spineRect, stage: "detail" });
      return;
    }

    // 阶段 1: Touch Down
    setState({ book, entry, spineEl, spineRect, stage: "touch" });
    setTimeout(() => {
      setState(prev => prev?.book.id === book.id ? { ...prev, stage: "pull" } : prev);
    }, 80);

    // 阶段 2: Pull-out
    setTimeout(() => {
      setState(prev => prev?.book.id === book.id ? { ...prev, stage: "rotate" } : prev);
    }, 260);

    // 阶段 3+4: Y-axis rotation + Cover takeover
    setTimeout(() => {
      setState(prev => prev?.book.id === book.id ? { ...prev, stage: "expand" } : prev);
    }, 460);

    // 阶段 5: Detail
    setTimeout(() => {
      setState(prev => prev?.book.id === book.id ? { ...prev, stage: "detail" } : prev);
    }, 720);
  }, [reducedMotion]);

  const closeDetail = useCallback(() => {
    if (!state) return;
    if (reducedMotion) {
      setState(null);
      return;
    }
    // Return：反向执行
    setIsReturning(true);
    setTimeout(() => {
      setState(prev => prev ? { ...prev, stage: "expand" } : prev);
    }, 50);
    setTimeout(() => {
      setState(prev => prev ? { ...prev, stage: "rotate" } : prev);
    }, 310);
    setTimeout(() => {
      setState(prev => prev ? { ...prev, stage: "pull" } : prev);
    }, 510);
    setTimeout(() => {
      setState(prev => prev ? { ...prev, stage: "touch" } : prev);
    }, 690);
    setTimeout(() => {
      setState(null);
      setIsReturning(false);
    }, 770);
  }, [state, reducedMotion]);

  return { pullOut: state, openDetail, closeDetail, isReturning };
}

/** 程序生成默认封面（无真实封面时） */
function GeneratedCover({ book, className }: { book: Book; className?: string }) {
  const palette = morandiPalette(book.id);
  return (
    <div
      className={`br2-gen-cover ${className ?? ""}`}
      style={{ background: palette.bg, color: palette.ink }}
      aria-hidden
    >
      <span className="br2-gen-cover-rule" />
      <span className="br2-gen-cover-title">{book.title}</span>
      <span className="br2-gen-cover-author">{book.author}</span>
      <span className="br2-gen-cover-dot" />
    </div>
  );
}

/** 抽书动画覆盖层 */
function PullOutOverlay({
  state,
  entry,
  onClose,
  onRead,
  onFavorite,
  onStatus,
  onRemove,
  onDeleteImported,
  onCoverChange,
  progressMap,
}: {
  state: PullOutState;
  entry: BookshelfEntry;
  onClose: () => void;
  onRead: () => void;
  onFavorite: (fav: boolean) => void;
  onStatus: (s: ShelfStatus) => void;
  onRemove: () => void;
  onDeleteImported?: () => void;
  onCoverChange: () => void;
  progressMap: Record<string, ReadingProgress>;
}) {
  const { book, spineRect, stage } = state;
  const reducedMotion = prefersReducedMotion();
  const percent = getOverallPercent(book, progressMap[book.id]);

  const customCover = getShelfEntry(book.id)?.customCover;
  const coverSrc = customCover ?? (book.coverUrl || undefined);
  const hasRealCover = Boolean(coverSrc);

  // FLIP 计算：Wrapper 的最终位置
  const anchorX = window.innerWidth / 2 - 75; // 封面宽度约 150px
  const anchorY = window.innerHeight * 0.32;

  // 阶段对应的 transform
  const stageStyles: Record<PullOutState["stage"], React.CSSProperties> = {
    idle: {},
    touch: {
      transform: `translate(${spineRect.left}px, ${spineRect.top}px) scale(0.98)`,
      transition: "transform 80ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    },
    pull: {
      transform: `translate(${spineRect.left}px, ${spineRect.top - 10}px) rotate(-3deg) scale(1.05)`,
      transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
    rotate: {
      transform: `translate(${spineRect.left}px, ${spineRect.top - 28}px) rotate(0deg) perspective(700px) rotateY(18deg) scale(1.15)`,
      transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
    expand: {
      transform: `translate(${anchorX}px, ${anchorY}px) perspective(700px) rotateY(0deg) scale(1)`,
      transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
    detail: {
      transform: `translate(${anchorX}px, ${anchorY}px) perspective(700px) rotateY(0deg) scale(1)`,
      transition: reducedMotion ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
  };

  const currentStyle = stageStyles[stage];

  return (
    <div className="br2-pullout-overlay" role="dialog" aria-modal="true" aria-label={`《${book.title}》详情`}>
      {/* 背景层 */}
      <button
        type="button"
        className="br2-pullout-bg"
        onClick={onClose}
        tabIndex={-1}
        aria-label="关闭"
      />

      {/* Book Wrapper：只做 x/y/scale，不做拉伸 */}
      <div
        className="br2-book-wrapper"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 150,
          height: 220,
          zIndex: 100,
          transformOrigin: "center center",
          ...currentStyle,
        }}
      >
        {/* Spine Face */}
        <div
          className="br2-spine-face"
          style={{
            opacity: stage === "expand" || stage === "detail" ? 0 : 1,
            transition: "opacity 80ms ease",
          }}
        >
          <div
            className="br2-spine-face-inner"
            style={{
              width: "100%",
              height: "100%",
              background: `var(--spine-bg, ${SPINE_TONE[book.coverTone].bg})`,
              borderRadius: "3px 3px 1.5px 1.5px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 4px",
            }}
          >
            <span style={{ writingMode: "vertical-rl", fontSize: 12, fontWeight: 600, color: SPINE_TONE[book.coverTone].ink, letterSpacing: "0.16em" }}>
              {book.title}
            </span>
            <span style={{ writingMode: "vertical-rl", fontSize: 9, color: SPINE_TONE[book.coverTone].ink, opacity: 0.62, marginTop: 8 }}>
              {book.author}
            </span>
          </div>
        </div>

        {/* Cover Face */}
        <div
          className="br2-cover-face"
          style={{
            opacity: stage === "expand" || stage === "detail" ? 1 : 0,
            transition: "opacity 80ms ease",
            position: "absolute",
            inset: 0,
          }}
        >
          {hasRealCover ? (
            <div className="br2-cover-real">
              <img src={coverSrc} alt={`《${book.title}》封面`} />
            </div>
          ) : (
            <GeneratedCover book={book} className="br2-cover-generated" />
          )}
        </div>
      </div>

      {/* 详情区域：从书封底部生长 */}
      {stage === "detail" && (
        <div className="br2-detail-panel book-glass">
          <div className="br2-detail-header">
            <h3 className="br2-detail-title">{book.title}</h3>
            <p className="br2-detail-author">{book.author}</p>
            {percent > 0 && (
              <div className="br2-detail-progress">
                <div className="br2-detail-progress-fill" style={{ width: `${percent}%` }} />
                <span>{percent}%</span>
              </div>
            )}
          </div>
          <div className="br2-detail-actions">
            <button
              type="button"
              className="br2-detail-primary book-pressable"
              onClick={onRead}
            >
              继续阅读
            </button>
            <div className="br2-detail-secondary">
              <button
                type="button"
                className={`br2-detail-icon-btn ${entry.favorite ? "is-fav" : ""}`}
                onClick={() => onFavorite(!entry.favorite)}
                aria-label={entry.favorite ? "取消收藏" : "收藏"}
              >
                ♥
              </button>
              <button
                type="button"
                className="br2-detail-icon-btn"
                onClick={() => onStatus(entry.status === "finished" ? "reading" : "finished")}
                aria-label={entry.status === "finished" ? "标为在读" : "标为已读"}
              >
                {entry.status === "finished" ? "↺" : "✓"}
              </button>
              <button
                type="button"
                className="br2-detail-icon-btn"
                onClick={onRemove}
                aria-label="移出书架"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {/* More 操作 */}
          <div className="br2-detail-more">
            <ShelfFocusSheet
              book={book}
              entry={entry}
              percent={percent}
              onClose={onClose}
              onRead={onRead}
              onDetail={() => {}}
              onFavorite={onFavorite}
              onStatus={onStatus}
              onAddToCollection={() => {}}
              onRemoveFromShelf={onRemove}
              onDeleteImported={onDeleteImported}
              onCoverChange={onCoverChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ 书架分层算法 ═══════════════════════ */

/**
 * V2 分层策略（spec 第六部分实例）：
 * - 390×844，层板可用宽度 350px（390 - 20×2 margin）
 * - 每层视觉占用 72%–92%
 * - 打破均匀排列：3–4 本一组，组间留白缝隙 3–6px
 * - 每层至少含一种非标准竖立书单元
 *
 * 简化实现：将书分配到层，按确定性 hash 决定每层的
 * 内容物类型组合，保证同一用户每次打开一致。
 */
function assignTiers(
  items: { book: Book; entry: BookshelfEntry; percent: number }[],
  collections: BookCollection[],
): SpineSpec[][] {
  if (items.length === 0) return [];

  // 将书本分为"有分组的"和"无分组的"
  const grouped = new Map<string, { book: Book; entry: BookshelfEntry }[]>();
  const ungrouped: typeof items = [];

  for (const item of items) {
    const colIds = item.entry.collectionIds ?? [];
    if (colIds.length > 0) {
      const colId = colIds[0];
      if (!grouped.has(colId)) grouped.set(colId, []);
      grouped.get(colId)!.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  // 构建 SpineSpec 列表
  const specs: SpineSpec[] = [];

  // 1. 添加分组为书夹
  for (const [colId, books] of grouped) {
    const col = collections.find(c => c.id === colId);
    const isCurated = col?.name.includes("收藏") || col?.name.includes("卷宗");
    const ids = books.map(b => b.book.id);
    specs.push({
      type: isCurated ? "curated" : "folder",
      width: isCurated ? 68 : 52,
      height: 100,
      folderIds: ids,
      folderKind: isCurated ? "curated" : "regular",
      folderName: col?.name,
      folderDotColor: isCurated ? "#A8B5A0" : undefined,
    });
  }

  // 2. 无分组的书：按类型分配
  const shuffled = [...ungrouped];
  // 确定性 shuffle（基于书名 hash）
  shuffled.sort((a, b) => stableHash(a.book.id) - stableHash(b.book.id));

  let i = 0;
  while (i < shuffled.length) {
    const item = shuffled[i];
    const hash = stableHash(item.book.id);
    const mod = hash % 10;

    if (mod === 0 && i + 1 < shuffled.length) {
      // 10% 概率：横放书组（2 本）
      const s = horizontalSize(item.book.id);
      specs.push({
        type: "horizontal",
        width: s.w,
        height: s.h,
        stackIds: [item.book.id, shuffled[i + 1].book.id],
      });
      i += 2;
    } else if (mod === 1) {
      // 10% 概率：画册
      const s = artbookSize(item.book.id);
      specs.push({
        type: "artbook",
        width: s.w,
        height: s.h,
      });
      i += 1;
    } else if (mod === 2 && i + 1 < shuffled.length) {
      // 10% 概率：小型书组（2–3 本薄册）
      const clusterCount = (hash % 2) + 2; // 2 or 3
      const ids = shuffled.slice(i, i + clusterCount).map(x => x.book.id);
      const s = clusterSize(ids[0]);
      specs.push({
        type: "cluster",
        width: s.w,
        height: s.h,
        clusterIds: ids,
      });
      i += clusterCount;
    } else if (mod === 3) {
      // 10% 概率：薄册
      const s = bookletSize(item.book.id);
      specs.push({
        type: "booklet",
        width: s.w,
        height: s.h,
      });
      i += 1;
    } else {
      // 标准书脊
      const s = spineSize(item.book.id);
      specs.push({
        type: "standard",
        width: s.w,
        height: s.h,
      });
      i += 1;
    }
  }

  // 分层：每层 350px 可用宽度，填充至 72%–92%
  const TIER_WIDTH = 350;
  const tiers: SpineSpec[][] = [];
  let current: SpineSpec[] = [];
  let currentWidth = 0;

  for (const spec of specs) {
    const gap = current.length > 0 ? 2 : 0; // 书本间距 1–2px
    const totalWidth = spec.width + gap;

    if (currentWidth + totalWidth > TIER_WIDTH && current.length > 0) {
      // 当前层已满，计算占用率
      const occupancy = currentWidth / TIER_WIDTH;
      // 如果占用率低于 72%，尝试加一本薄册
      if (occupancy < 0.72) {
        const remaining = TIER_WIDTH - currentWidth;
        if (remaining >= 10) {
          // 用薄册填充
          current.push({ type: "booklet", width: 10, height: 90 });
          currentWidth += 10;
        }
      }
      tiers.push(current);
      current = [spec];
      currentWidth = spec.width;
    } else {
      current.push(spec);
      currentWidth += totalWidth;
    }
  }

  if (current.length > 0) {
    // 最后一层：如果是藏书较少状态（< 8 本），压缩为聚落
    const totalBooks = current.reduce((sum, s) => sum + (s.folderIds?.length ?? s.clusterIds?.length ?? s.stackIds?.length ?? 1), 0);
    if (totalBooks < 8 && tiers.length === 0) {
      // Sparse Shelf：聚落占 30–40%
      // 在末尾添加 bookend + paper tag 标记
      current.push({ type: "bookend", width: 12, height: 60 });
    }
    tiers.push(current);
  }

  return tiers;
}

/* ═══════════════════════ 主组件 ═══════════════════════ */

export function BookshelfView({ onOpenBook, onContinue }: Props) {
  const [entries, setEntries] = useState<BookshelfEntry[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress>>({});
  const [collections, setCollections] = useState<BookCollection[]>([]);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const [view, setView] = useState<ShelfView>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"spine" | "cover">("spine");

  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ book: Book; kind: "remove" | "delete" } | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  // 拖动排序
  const dragId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 抽书动画
  const { pullOut, openDetail, closeDetail } = usePullOutAnimation();

  const refresh = useCallback(() => {
    setEntries(listShelfEntries());
    const progs: Record<string, ReadingProgress> = {};
    for (const p of listReadingProgress()) progs[p.bookId] = p;
    setProgressMap(progs);
    setCollections(listCollections());
    setCustomOrder(loadShelfOrder());
  }, []);

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
        case "reading": return entry.status === "reading";
        case "unread": return entry.status === "unread";
        case "finished": return entry.status === "finished";
        case "favorite": return Boolean(entry.favorite);
        case "recent": return (entry.lastReadAt ?? 0) > 0 && now - (entry.lastReadAt ?? 0) < 1000 * 60 * 60 * 24 * 365;
        case "imported": return entry.source === "imported";
        default: return true;
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
        case "recent": return (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0);
        case "added": return (b.entry.addedAt ?? 0) - (a.entry.addedAt ?? 0);
        case "title": return a.book.title.localeCompare(b.book.title, "zh");
        case "author": return a.book.author.localeCompare(b.book.author, "zh");
        case "progress": return b.percent - a.percent;
        default: return 0;
      }
    });
    return arr;
  }, [searched, sortKey, customOrder]);

  /** V2 书架分层 */
  const tiers = useMemo(() => {
    if (mode !== "spine") return [];
    return assignTiers(sorted, collections);
  }, [sorted, collections, mode]);

  /** 判断是否为 Sparse Shelf */
  const isSparse = sorted.length < 8 && sorted.length > 0;

  /* ───── Continue Reading ───── */
  const continueInfo = useMemo(() => {
    const candidates = items
      .filter(({ entry, percent }) => entry.status === "reading" && percent > 0)
      .sort((a, b) => (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0));
    if (candidates[0]) return candidates[0];
    const recents = items
      .filter(({ percent }) => percent > 0)
      .sort((a, b) => (b.entry.lastReadAt ?? 0) - (a.entry.lastReadAt ?? 0));
    return recents[0] ?? null;
  }, [items]);

  /* ───── 事件处理 ───── */
  const handleSelect = useCallback((book: Book, spineEl?: HTMLElement) => {
    const entry = entries.find(e => e.bookId === book.id);
    if (!entry) return;
    if (spineEl) {
      openDetail(book, entry, spineEl);
    }
  }, [entries, openDetail]);

  const handleContinueClick = useCallback(() => {
    if (!continueInfo) return;
    const { book, entry } = continueInfo;
    markReading(book.id);
    if (entry.source === "imported") {
      const full = getImportedBookWithChapters(book.id);
      onContinue(full ?? book);
    } else {
      onContinue(book);
    }
  }, [continueInfo, onContinue]);

  const handleReadFromFocus = useCallback((book: Book, entry: BookshelfEntry) => {
    markReading(book.id);
    closeDetail();
    if (entry.source === "imported") {
      const full = getImportedBookWithChapters(book.id);
      onContinue(full ?? book);
    } else {
      onContinue(book);
    }
  }, [closeDetail, onContinue]);

  const handleFavorite = useCallback((bookId: string, favorite: boolean) => {
    toggleFavorite(bookId, favorite);
    refresh();
  }, [refresh]);

  const handleStatus = useCallback((bookId: string, status: ShelfStatus) => {
    setShelfStatus(bookId, status);
    refresh();
  }, [refresh]);

  const confirmRemove = useCallback((book: Book) => {
    setDeleteTarget({ book, kind: "remove" });
  }, []);

  const confirmDeleteImported = useCallback((book: Book) => {
    setDeleteTarget({ book, kind: "delete" });
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    const { book, kind } = deleteTarget;
    if (kind === "remove") {
      removeFromShelf(book.id);
    } else {
      removeFromShelf(book.id);
      deleteImportedBook(book.id);
      deleteReadingProgress(book.id);
      clearBookAnnotations(book.id);
    }
    setDeleteTarget(null);
    closeDetail();
    refresh();
  }, [deleteTarget, closeDetail, refresh]);

  const handleImported = useCallback((book: Book) => {
    addToShelf(book.id, "imported");
    refresh();
    setImportOpen(false);
    const full = getImportedBookWithChapters(book.id);
    onOpenBook(full ?? book);
  }, [refresh, onOpenBook]);

  /* ───── 拖动排序 ───── */
  const onDragStart = useCallback((id: string) => {
    if (sortKey !== "custom") return;
    dragId.current = id;
    setDraggingId(id);
  }, [sortKey]);

  const onDragOver = useCallback((e: React.DragEvent, id: string) => {
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
  }, [sortKey, customOrder]);

  const onDragEnd = useCallback(() => {
    dragId.current = null;
    setDraggingId(null);
  }, []);

  /* ───── 分组管理 ───── */
  const handleCreateCollection = useCallback(() => {
    const name = window.prompt("新建分组名称");
    if (!name?.trim()) return;
    createCollection(name.trim());
    setCollections(listCollections());
  }, []);

  const handleRenameCollection = useCallback((col: BookCollection) => {
    const name = window.prompt("重命名分组", col.name);
    if (!name?.trim()) return;
    renameCollection(col.id, name.trim());
    setCollections(listCollections());
  }, []);

  const handleDeleteCollection = useCallback((col: BookCollection) => {
    if (!window.confirm(`删除分组「${col.name}」？分组中的书不会被删除。`)) return;
    deleteCollection(col.id);
    setCollections(listCollections());
    refresh();
  }, [refresh]);

  const emptyText: Record<ShelfView, string> = {
    all: "书架还是空的，去书城挑一本，或导入你的书。",
    reading: "还没有正在阅读的书。",
    unread: "没有未读的书。",
    finished: "还没有读完的书。",
    favorite: "还没有收藏内容。",
    recent: "还没有阅读记录。",
    imported: "还没有导入书籍。",
  };

  const dark = isDarkMode();

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
              <button type="button" className="book-cta book-pressable" onClick={handleContinueClick}>
                继续阅读
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 工具区 */}
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
              <button type="button" className="br-shelf-search-clear" onClick={() => setSearch("")} aria-label="清除搜索">
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
            options={[{ value: "spine", label: "书脊" }, { value: "cover", label: "封面" }]}
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
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} aria-label="排序方式">
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={12} strokeWidth={2} />
          </div>
          <button type="button" className="br-shelf-action book-pressable" onClick={handleCreateCollection} aria-label="新建分组">
            <FolderPlus size={14} strokeWidth={2} />
          </button>
          {collections.length > 0 && (
            <button type="button" className="br-shelf-action book-pressable" onClick={() => setCollectionsOpen(true)} aria-label="管理分组">
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </section>

      {/* 书架主体 */}
      {sorted.length === 0 ? (
        <p className="book-empty br-shelf-empty">{emptyText[view]}</p>
      ) : mode === "spine" ? (
        <div className={`br2-shelf-board ${isSparse ? "br2-shelf-sparse" : ""}`}>
          {tiers.map((tier, ti) => (
            <div className="br2-shelf-tier" key={ti}>
              <div className="br2-shelf-spines">
                {tier.map((spec, si) => {
                  const key = `${ti}-${si}`;

                  if (spec.type === "folder" || spec.type === "curated") {
                    const folderBooks = (spec.folderIds ?? [])
                      .map(id => items.find(it => it.book.id === id)?.book)
                      .filter((b): b is Book => b !== undefined);
                    if (folderBooks.length === 0) return null;
                    return spec.type === "curated" ? (
                      <CuratedFolder
                        key={key}
                        folder={spec}
                        books={folderBooks}
                        dark={dark}
                        onOpen={b => {
                          const el = document.querySelector(`[data-book-id="${b.id}"]`) as HTMLElement;
                          handleSelect(b, el ?? undefined);
                        }}
                      />
                    ) : (
                      <BookFolder
                        key={key}
                        folder={spec}
                        books={folderBooks}
                        dark={dark}
                        onOpen={b => {
                          const el = document.querySelector(`[data-book-id="${b.id}"]`) as HTMLElement;
                          handleSelect(b, el ?? undefined);
                        }}
                      />
                    );
                  }

                  if (spec.type === "horizontal") {
                    const stackBooks = (spec.stackIds ?? [])
                      .map(id => items.find(it => it.book.id === id)?.book)
                      .filter((b): b is Book => b !== undefined);
                    if (stackBooks.length === 0) return null;
                    return (
                      <HorizontalStack
                        key={key}
                        books={stackBooks}
                        onSelect={b => {
                          const el = document.querySelector(`[data-book-id="${b.id}"]`) as HTMLElement;
                          handleSelect(b, el ?? undefined);
                        }}
                      />
                    );
                  }

                  if (spec.type === "cluster") {
                    const clusterBooks = (spec.clusterIds ?? [])
                      .map(id => items.find(it => it.book.id === id)?.book)
                      .filter((b): b is Book => b !== undefined);
                    return (
                      <div key={key} className="br2-cluster" style={{ width: spec.width, height: spec.height }}>
                        {clusterBooks.map((b, ci) => {
                          const bs = bookletSize(b.id);
                          return (
                            <BookSpineV2
                              key={b.id}
                              book={b}
                              percent={items.find(it => it.book.id === b.id)?.percent ?? 0}
                              spineType="booklet"
                              width={bs.w}
                              height={bs.h - ci * 2}
                              onSelect={book => {
                                const el = document.querySelector(`[data-book-id="${book.id}"]`) as HTMLElement;
                                handleSelect(book, el ?? undefined);
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  }

                  if (spec.type === "bookend") {
                    return <Bookend key={key} />;
                  }

                  // standard / booklet / artbook：直接从 items 中按顺序取（确定性）
                  const ungroupedItems = items.filter(it => !(it.entry.collectionIds ?? []).length);
                  const bookIndex = si % ungroupedItems.length;
                  const bookItem = ungroupedItems[bookIndex];
                  if (!bookItem) return null;

                  const { book, percent } = bookItem;

                  return (
                    <div key={key} data-book-id={book.id} style={{ display: "contents" }}>
                      <BookSpineV2
                        book={book}
                        percent={percent}
                        spineType={spec.type}
                        width={spec.width}
                        height={spec.height}
                        onSelect={b => {
                          const el = document.querySelector(`[data-book-id="${b.id}"]`) as HTMLElement;
                          handleSelect(b, el ?? undefined);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* 层板 */}
              <div className="br2-shelf-board-plank" aria-hidden />
              {/* 层板对下层的投影延伸 */}
              <div className="br2-shelf-board-shadow" aria-hidden />
            </div>
          ))}

          {/* Sparse Shelf 引导 */}
          {isSparse && (
            <div className="br2-shelf-sparse-guide">
              <PaperTag text="继续充实你的书架" />
              <button
                type="button"
                className="br2-shelf-guide-btn book-pressable"
                onClick={() => setImportOpen(true)}
              >
                <BookPlus size={14} strokeWidth={2} />
                <span>导入书籍</span>
              </button>
            </div>
          )}
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
                  {entry.lastReadAt && <span className="br-shelf-card-date">{formatDate(entry.lastReadAt)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="book-footer">BOOKROOM · SHELF</footer>

      {/* 抽书动画覆盖层 */}
      {pullOut && (
        <PullOutOverlay
          state={pullOut}
          entry={pullOut.entry}
          onClose={closeDetail}
          onRead={() => handleReadFromFocus(pullOut.book, pullOut.entry)}
          onFavorite={fav => handleFavorite(pullOut.book.id, fav)}
          onStatus={status => handleStatus(pullOut.book.id, status)}
          onRemove={() => confirmRemove(pullOut.book)}
          onDeleteImported={
            pullOut.book.source === "imported"
              ? () => confirmDeleteImported(pullOut.book)
              : undefined
          }
          onCoverChange={refresh}
          progressMap={progressMap}
        />
      )}

      {/* 导入半弹窗 */}
      {importOpen && (
        <ImportSheet onClose={() => setImportOpen(false)} onImported={handleImported} />
      )}

      {/* 移出 / 删除确认 */}
      {deleteTarget && (
        <div className="br-del-confirm" role="dialog" aria-modal="true" aria-label="确认操作">
          <button type="button" className="br-sheet-scrim" onClick={() => setDeleteTarget(null)} tabIndex={-1} />
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
              <button type="button" className="br-quiet-btn book-pressable" onClick={() => setDeleteTarget(null)}>取消</button>
              <button type="button" className="br-del-confirm-yes book-pressable" onClick={handleDeleteConfirm}>
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
                  <button type="button" className="br-quiet-btn book-pressable" onClick={() => handleRenameCollection(col)}>
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button type="button" className="br-quiet-btn book-pressable is-danger" onClick={() => handleDeleteCollection(col)}>
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
            {collections.length === 0 && <p className="book-empty">还没有分组。</p>}
            <button type="button" className="br-sheet-primary book-pressable" onClick={handleCreateCollection}>
              + 新建分组
            </button>
          </section>
        </BottomSheet>
      )}
    </>
  );
}
