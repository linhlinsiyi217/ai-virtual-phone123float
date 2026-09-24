import { createContext, type ReactNode } from "react";

// iOS 26 风格导航与交互上下文
export const SettingsNavigationContext = createContext<{
    push: (page: string, title?: string) => void;
    pop: () => void;
    setRightAction: (action: ReactNode | null) => void;
}>({
    push: () => {},
    pop: () => {},
    setRightAction: () => {}
});

// 统一的 Pearl Glass 类名与变量参考
// 导航栏: .settings-nav-glass
// 分组容器: .settings-group-glass
// 控件: .settings-control-glass
export const GLASS_STYLES = {
    nav: "sticky top-0 z-50 backdrop-blur-xl bg-[var(--c-header-bg)]/80 border-b border-black/5",
    group: "bg-[var(--c-card)]/70 backdrop-blur-md rounded-2xl border border-[var(--c-card-border)] overflow-hidden shadow-sm",
    item: "flex items-center w-full px-4 py-3 active:bg-black/5 transition-colors"
};
