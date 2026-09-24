"use client";

import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";

export function PageShell({
  title,
  large = false,
  onBack,
  onClose,
  rightAction,
  search,
  children,
}: {
  title: string;
  large?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  rightAction?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="sv2-page">
      <header className="sv2-header">
        <div className="sv2-safe-top" />
        <div className="sv2-nav">
          <div className="sv2-nav-side">
            {onBack ? <button className="sv2-nav-btn" type="button" onClick={onBack} aria-label="返回"><ChevronLeft size={21} /><span>设置</span></button> : <span aria-hidden="true" />}
          </div>
          <h1 className={large ? "sv2-title sv2-title-large" : "sv2-title"}>{title}</h1>
          <div className="sv2-nav-side sv2-nav-right">{rightAction}{onClose ? <button className="sv2-nav-btn sv2-icon-btn" type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button> : null}</div>
        </div>
        {search}
      </header>
      <main className="sv2-body">{children}</main>
    </div>
  );
}
