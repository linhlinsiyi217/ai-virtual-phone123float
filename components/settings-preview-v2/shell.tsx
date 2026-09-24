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
      <style>{`
        .sv2-page{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--sv-bg)}
        .sv2-header{flex:0 0 auto;padding:0 16px;background:color-mix(in srgb,var(--sv-bg) 86%,transparent);backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);z-index:2;border-bottom:1px solid var(--sv-line)}
        .sv2-safe-top{height:env(safe-area-inset-top,0px)}
        .sv2-nav{height:50px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}
        .sv2-nav-side{display:flex;align-items:center}
        .sv2-nav-right{justify-content:flex-end}
        .sv2-nav-btn{border:0;background:transparent;color:var(--sv-blue);display:inline-flex;align-items:center;padding:7px 0;font:inherit;cursor:pointer}
        .sv2-title{font-size:17px;font-weight:650;margin:0;white-space:nowrap}
        .sv2-body{flex:1;overflow-y:auto;padding:0 16px calc(32px + env(safe-area-inset-bottom,0px))}
      `}</style>
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
