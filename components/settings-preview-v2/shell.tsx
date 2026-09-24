import { useState, useCallback, useMemo } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";

export function SettingsShellV2({ 
    children, 
    initialTitle = "设置" 
}: { 
    children: ReactNode; 
    initialTitle?: string 
}) {
    const [stack, setStack] = useState([{ page: "main", title: initialTitle }]);
    const [rightActions, setRightActions] = useState<Record<string, ReactNode>>({});

    const push = useCallback((page: string, title?: string) => {
        setStack(prev => [...prev, { page, title: title || "" }]);
    }, []);

    const pop = useCallback(() => {
        if (stack.length > 1) setStack(prev => prev.slice(0, -1));
    }, [stack]);

    const active = stack[stack.length - 1];
    const isMain = active.page === "main";

    return (
        <SettingsNavigationContext.Provider value={{ 
            push, pop, 
            setRightAction: (action) => setRightActions(p => ({ ...p, [active.page]: action })) 
        }}>
            <div className="flex flex-col h-full bg-[var(--c-page-body-bg)] font-sans">
                {/* 顶部大标题栏 */}
                <header className={GLASS_STYLES.nav + " px-4 py-4"}>
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold tracking-tight text-[var(--c-text-title)]">
                            {active.title}
                        </h1>
                        {rightActions[active.page]}
                    </div>
                    {!isMain && (
                        <button onClick={pop} className="mt-2 flex items-center text-[var(--c-icon)] active:opacity-70">
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
