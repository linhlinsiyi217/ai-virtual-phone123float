"use client";

import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Underline as UnderlineIcon,
  StickyNote,
  Sparkles,
  Search,
  Star,
  Share2,
  PenLine,
  MoreHorizontal,
} from "lucide-react";

export type ReaderMenuAction =
  | "copy"
  | "underline"
  | "note"
  | "ask"
  | "translate"
  | "highlight"
  | "search"
  | "listen"
  | "favorite"
  | "share"
  | "websearch"
  | "aiwrite"
  | "more";

export type ReaderSelectionRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

type Props = {
  rect: ReaderSelectionRect;
  /** 选区是否限制在单段内：划线 / 高亮 / 笔记仅支持单段 */
  singleParagraph: boolean;
  onAction: (action: ReaderMenuAction) => void;
};

type Item = {
  action: ReaderMenuAction;
  label: string;
  icon: LucideIcon;
  singleOnly?: boolean;
};

/* Phase 9B：两行主菜单 + 「更多」收进 BottomSheet
   第一行：复制 / 划线 / 笔记 / 收藏 / 分享
   第二行：搜索 / 问TA / AI写作 / 更多 */
const ROW_1: Item[] = [
  { action: "copy", label: "复制", icon: Copy },
  { action: "underline", label: "划线", icon: UnderlineIcon, singleOnly: true },
  { action: "note", label: "笔记", icon: StickyNote, singleOnly: true },
  { action: "favorite", label: "收藏", icon: Star, singleOnly: true },
  { action: "share", label: "分享", icon: Share2 },
];

const ROW_2: Item[] = [
  { action: "search", label: "搜索", icon: Search },
  { action: "ask", label: "问TA", icon: Sparkles },
  { action: "aiwrite", label: "AI写作", icon: PenLine },
  { action: "more", label: "更多", icon: MoreHorizontal },
];

const MENU_HEIGHT = 96;
const MENU_WIDTH = 272;

let cachedSafeTop = -1;
/** 读取顶部安全区（状态栏 / 灵动岛）：通过 env(safe-area-inset-top) 探针，菜单不能压上去 */
function safeTop(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  if (cachedSafeTop >= 0) return cachedSafeTop;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  cachedSafeTop = Math.round(parseFloat(getComputedStyle(probe).paddingTop) || 0);
  document.body.removeChild(probe);
  return cachedSafeTop;
}

/**
 * 阅读器正文划词工具菜单（Phase 3B，Phase 9B 两行化）：
 * 纯展示层，跟随选区浮出；正文区非常驻工具栏。
 * 用 onPointerDown preventDefault 保住系统选区，点击后由调用方收起。
 * 定位：优先选区上方，不足则下方；横向夹入视口；避开状态栏安全区。
 */
export function ReaderSelectionMenu({ rect, singleParagraph, onAction }: Props) {
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 679;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 390;
  const topSafe = safeTop() + 6;

  const placeAbove = rect.top - topSafe > MENU_HEIGHT + 18;
  const rawTop = placeAbove ? rect.top - MENU_HEIGHT - 10 : rect.bottom + 10;
  // 纵向夹入视口：跨多行大选区上下翻转后仍可能超出屏幕
  const top = Math.max(topSafe, Math.min(rawTop, viewportHeight - MENU_HEIGHT - 8));
  const minLeft = Math.min(rect.left, rect.right);
  const center = (rect.left + rect.right) / 2;
  const left = Math.max(8, Math.min(center - MENU_WIDTH / 2, Math.min(minLeft, viewportWidth - MENU_WIDTH - 8)));

  const renderItem = (item: Item) => {
    const disabled = item.singleOnly && !singleParagraph;
    const Icon = item.icon;
    return (
      <button
        key={item.action}
        type="button"
        className="reader-menu-item book-pressable"
        disabled={disabled}
        title={disabled ? "请在同一段落内选择" : undefined}
        onPointerDown={event => event.preventDefault()}
        onClick={() => onAction(item.action)}
      >
        <Icon size={15} strokeWidth={2} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <div
      className="reader-select-menu"
      role="toolbar"
      aria-label="阅读工具"
      style={{ position: "fixed", top, left, width: MENU_WIDTH }}
    >
      <div className="reader-menu-row">{ROW_1.map(renderItem)}</div>
      <div className="reader-menu-row">{ROW_2.map(renderItem)}</div>
    </div>
  );
}
