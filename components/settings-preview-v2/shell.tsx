import { useState, useCallback, useMemo, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";

import { ChevronLeft } from "lucide-react";

export function SettingsShellV2({ 
    children, 
    title,
    rightAction,
    onBack,
    onClose,
    isMain,
    searchQuery,
    onSearchQueryChange,
    bodyRef,
}: { 
    children: ReactNode; 
    title: string;
    rightAction?: ReactNode;
    onBack?: () => void;
    onClose?: () => void;
    isMain?: boolean;
    searchQuery?: string;
    onSearchQueryChange?: (q: string) => void;
    bodyRef?: React.Ref<HTMLElement>;
}) {
    return (
        <div className="settings-v2 flex flex-col h-full font-sans">
            <header className="settings-v2__header">
                <div className="settings-v2__navigation">
                    {isMain ? (
                        <h1 className="settings-v2__home-title">
                            <button
                                type="button"
                                className="settings-v2__home-exit"
                                onClick={onClose}
                                aria-label="退出设置，返回桌面"
                            >
                                设置
                            </button>
                        </h1>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="settings-v2__nav-button"
                                onClick={onBack}
                                aria-label="返回上一页"
                            >
                                <ChevronLeft size={21} strokeWidth={2} />
                            </button>
                            <h1 className="settings-v2__page-title">{title}</h1>
                        </>
                    )}
                    <div className="settings-v2__trailing">
                        {!isMain && rightAction}
                    </div>
                </div>
            </header>

            {isMain && onSearchQueryChange && (
                <div className="px-4 pb-3">
                    <div className="flex items-center bg-[#f0f2f5] rounded-xl px-3 py-2 text-[var(--settings-secondary)]">
                        <Search size={18} className="mr-2 shrink-0" />
                        <input 
                            type="text" 
                            placeholder="搜索设置" 
                            className="bg-transparent border-none outline-none w-full text-[var(--settings-text)] text-sm"
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value)}
                        />
                    </div>
                </div>
            )}

            <main ref={bodyRef} className="settings-v2__scroller flex-1 p-4">
                {children}
            </main>
        </div>
    );
}
