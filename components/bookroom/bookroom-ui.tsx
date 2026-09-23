"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/* ───────────────────────── 底部半弹窗（Bottom Sheet） ───────────────────────── */

type BottomSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 追加在面板上的修饰类（如调高面板） */
  panelClassName?: string;
};

/**
 * 书房统一底部半弹窗：奶白磨砂面板 + 顶部抓条 + 轻遮罩。
 * 所有夜读 / 共读 / 颜色调试工具层共用，避免做成独立大页面。
 */
export function BottomSheet({ title, onClose, children, panelClassName }: BottomSheetProps) {
  return (
    <div className="br-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="br-sheet-scrim"
        onClick={onClose}
        aria-label="关闭弹层"
        tabIndex={-1}
      />
      <section className={`br-sheet ${panelClassName ?? ""}`}>
        <div className="br-sheet-grabber" aria-hidden />
        <header className="br-sheet-head">
          <h3 className="br-sheet-title">{title}</h3>
          <button
            type="button"
            className="book-icon-btn book-pressable br-sheet-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </header>
        <div className="br-sheet-body">{children}</div>
      </section>
    </div>
  );
}

/* ───────────────────────── 分段控件 ───────────────────────── */

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="br-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`br-segmented-item book-pressable ${active ? "is-active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── 轻提示 ───────────────────────── */

/** 页面级轻提示：调用方用 state 控制显隐；定位由 .br-toast 处理 */
export function BrToast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="br-toast" aria-live="polite">
      {text}
    </div>
  );
}

