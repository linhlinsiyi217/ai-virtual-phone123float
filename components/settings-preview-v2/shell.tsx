import { useState, useCallback, useMemo, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";

export function SettingsShellV2({ 
    children, 
    title,
    rightAction,
    onBack,
}: { 
    children: ReactNode; 
    title: string;
    rightAction?: ReactNode;
    onBack?: () => void;
}) {
    // 简化逻辑：状态下移至由 SettingsContext 统一管理
    const isMain = !onBack;

    return (
        <div className="flex flex-col h-full bg-[var(--c-page-body-bg)] font-sans">
            {/* 顶部大标题栏 */}
            <header className={GLASS_STYLES.nav + " px-4 py-4"}>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--c-text-title)]">
                        {title}
                    </h1>
                    {rightAction}
                </div>
                {!isMain && (
                    <button onClick={onBack} className="mt-2 flex items-center text-[var(--c-icon)] active:opacity-70">
                        <ChevronRight className="rotate-180 mr-1" size={16} />
                        返回
                    </button>
                )}
            </header>

                {/* 搜索栏 */}
                {isMain && (
                    <div className="px-4 pb-4">
                        <div className="flex items-center bg-[var(--c-input)] rounded-lg px-3 py-2 text-[var(--c-icon)]">
                            <Search size={18} className="mr-2" />
                            <input type="text" placeholder="搜索设置" className="bg-transparent border-none outline-none w-full text-[var(--c-text)]" />
                        </div>
                    </div>
                )}

                {/* 内容容器 */}
                <main className="flex-1 overflow-y-auto p-4">
                    {children}
                </main>
            </div>
        </SettingsNavigationContext.Provider>
    );
}
