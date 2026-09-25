import { useState, useCallback, useMemo, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";

export function SettingsShellV2({ 
    children, 
    title,
    rightAction,
    onBack,
    searchQuery,
    onSearchQueryChange,
}: { 
    children: ReactNode; 
    title: string;
    rightAction?: ReactNode;
    onBack?: () => void;
    searchQuery?: string;
    onSearchQueryChange?: (q: string) => void;
}) {
    const isMain = !onBack;

    return (
        <div className="settings-v2 flex flex-col h-full font-sans">
            <header className="settings-v2__header px-4 py-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--settings-text)]">
                        {title}
                    </h1>
                    {rightAction}
                </div>
                {!isMain && (
                    <button onClick={onBack} className="settings-v2__glass-button mt-2 px-3 py-1 flex items-center text-sm active:opacity-70">
                        <ChevronRight className="rotate-180 mr-1" size={16} />
                        返回
                    </button>
                )}
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

            <main className="settings-v2__scroller flex-1 p-4">
                {children}
            </main>
        </div>
    );
}
