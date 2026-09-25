"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/* ───────────────────────── 底部半弹窗（Bottom Sheet） ───────────────────────── */

type BottomSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 追加在面板上的修饰类（如调高面板） */
  panelClassName?: string;
};

/** Phase 9B：统一拖拽关闭阈值 —— 下拉超过 96px 或快速下滑（>0.5px/ms）即关闭 */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5;

/**
 * 书房统一底部半弹窗：Pearl Glass 面板 + 顶部抓条 + 轻遮罩 + 拖拽下滑关闭。
 * 所有夜读 / 共读 / 外观 / 工具层共用，避免各写一套半屏交互。
 * 拖拽仅响应抓条与头部区域，正文滚动不受影响。
 */
export function BottomSheet({ title, onClose, children, panelClassName }: BottomSheetProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startY: number; lastY: number; lastT: number; active: boolean }>({
    startY: 0, lastY: 0, lastT: 0, active: false,
  });

  const onHandleDown = (e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    dragRef.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), active: true };
    panel.classList.add("is-dragging");
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag.active || !panel) return;
    const dy = Math.max(0, e.clientY - drag.startY); // 只允许向下拖
    drag.lastY = e.clientY;
    drag.lastT = performance.now();
    panel.style.transform = `translateY(${dy}px)`;
  };

  const onHandleUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag.active || !panel) return;
    drag.active = false;
    panel.classList.remove("is-dragging");
    const dy = Math.max(0, e.clientY - drag.startY);
    const dt = Math.max(1, performance.now() - drag.lastT);
    const velocity = dt < 120 ? (e.clientY - drag.lastY) / dt : 0; // 末段速度
    const flickDown = velocity > DISMISS_VELOCITY;
    if (dy > DISMISS_DISTANCE || (dy > 24 && flickDown)) {
      // 顺势滑出后关闭
      panel.style.transform = `translateY(${Math.max(dy + 40, 160)}px)`;
      window.setTimeout(onClose, 140);
    } else {
      panel.style.transform = "";
    }
  };

  return (
    <div className="br-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="br-sheet-scrim"
        onClick={onClose}
        aria-label="关闭弹层"
        tabIndex={-1}
      />
      <section className={`br-sheet ${panelClassName ?? ""}`} ref={panelRef}>
        <div
          className="br-sheet-grab-zone"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="br-sheet-grabber" aria-hidden />
        </div>
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

