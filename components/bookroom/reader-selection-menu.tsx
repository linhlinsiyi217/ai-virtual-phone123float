"use client";

import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Underline as UnderlineIcon,
  StickyNote,
  Sparkles,
  Languages,
  Highlighter,
  Search,
  Volume2,
} from "lucide-react";

export type ReaderMenuAction =
  | "copy"
  | "underline"
  | "note"
  | "ask"
  | "translate"
  | "highlight"
  | "search"
  | "listen";

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

const ROW_1: Item[] = [
  { action: "copy", label: "复制", icon: Copy },
  { action: "underline", label: "划线", icon: UnderlineIcon, singleOnly: true },
  { action: "note", label: "笔记", icon: StickyNote, singleOnly: true },
  { action: "ask", label: "问TA", icon: Sparkles },
];

const ROW_2: Item[] = [
  { action: "translate", label: "翻译", icon: Languages },
  { action: "highlight", label: "高亮", icon: Highlighter, singleOnly: true },
  { action: "search", label: "搜索", icon: Search },
  { action: "listen", label: "从此听", icon: Volume2 },
];

const MENU_HEIGHT = 92;
const MENU_WIDTH = 300;

/**
 * 阅读器正文划词工具菜单（Phase 3B）：
 * 纯展示层，跟随选区浮出；正文区非常驻工具栏。
 * 用 onPointerDown preventDefault 保住系统选区，点击后由调用方收起。
 */
export function ReaderSelectionMenu({ rect, singleParagraph, onAction }: Props) {
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 679;
  const placeAbove = rect.top > MENU_HEIGHT + 24;
  const rawTop = placeAbove ? rect.top - MENU_HEIGHT - 10 : rect.bottom + 10;
  // 纵向也夹进视口：跨多行的大选区上下翻转后仍可能超出屏幕
  const top = Math.max(8, Math.min(rawTop, viewportHeight - MENU_HEIGHT - 8));
  const minLeft = Math.min(rect.left, rect.right) ;
  const center = (rect.left + rect.right) / 2;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 390;
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
