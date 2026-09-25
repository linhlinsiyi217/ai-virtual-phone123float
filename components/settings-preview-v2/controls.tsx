import { useContext } from "react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";
import { ChevronRight } from "lucide-react";

import { type ReactNode } from "react";

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <div className="mb-6">
            {title && (
                <h3 className="text-xs font-semibold text-[var(--settings-secondary)] uppercase tracking-wider ml-1 mb-2">
                    {title}
                </h3>
            )}
            <div className="settings-v2__group">{children}</div>
        </div>
    );
}

export function SettingsRow({ 
    icon: Icon, 
    label, 
    desc, 
    onClick, 
    showChevron = true,
    danger = false
}: { 
    icon?: any; 
    label: string; 
    desc?: string; 
    onClick?: () => void;
    showChevron?: boolean;
    danger?: boolean;
}) {
    return (
        <button 
            type="button" 
            className={`settings-v2__row ${danger ? 'settings-v2__row--danger' : ''}`} 
            onClick={onClick}
        >
            {Icon && (
                <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] dark:bg-[#222228] flex items-center justify-center mr-3 shrink-0">
                    <Icon size={18} className={danger ? "text-[#d53535]" : "text-[var(--settings-text)]"} />
                </div>
            )}
            <div className="flex-1 text-left min-w-0">
                <div className="text-[15px] font-medium truncate">{label}</div>
                {desc && <div className="text-xs text-[var(--settings-secondary)] truncate">{desc}</div>}
            </div>
            {showChevron && <ChevronRight size={18} className="text-[var(--settings-secondary)] shrink-0 ml-2" />}
        </button>
    );
}

export function SettingsField({ label, children, desc, error }: { label: string, children: ReactNode, desc?: string, error?: string }) {
    return (
        <div className="flex flex-col gap-1.5 mb-4">
            <label className="text-sm font-medium text-[var(--settings-text)]">{label}</label>
            {children}
            {desc && !error && <div className="text-xs text-[var(--settings-secondary)]">{desc}</div>}
            {error && <div className="settings-v2__error">{error}</div>}
        </div>
    );
}

export function SettingsPrimaryButton({ children, onClick, disabled }: { children: ReactNode, onClick?: () => void, disabled?: boolean }) {
    return (
        <button type="button" className="settings-v2__primary w-full flex items-center justify-center disabled:opacity-50" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    );
}

export function SettingsDangerButton({ children, onClick, disabled }: { children: ReactNode, onClick?: () => void, disabled?: boolean }) {
    return (
        <button type="button" className="settings-v2__primary w-full flex items-center justify-center bg-[#d53535] disabled:opacity-50" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    );
}

// 保留旧的命名以防其他地方尚未更新
export function SettingsListGroup({ title, children }: { title?: string, children: ReactNode }) {
    return (
        <div className="mb-6">
            {title && <h3 className="text-xs font-semibold text-[var(--settings-secondary)] uppercase tracking-wider ml-1 mb-2">{title}</h3>}
            <div className="settings-v2__group">
                {children}
            </div>
        </div>
    );
}

export function SettingsListItem({ 
    icon: Icon, 
    label, 
    desc, 
    onClick, 
    showChevron = true 
}: { 
    icon: any, 
    label: string, 
    desc?: string, 
    onClick?: () => void,
    showChevron?: boolean 
}) {
    return (
        <button className="settings-v2__row" onClick={onClick}>
            <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] flex items-center justify-center mr-3 shrink-0">
                <Icon size={18} className="text-[var(--settings-text)]" />
            </div>
            <div className="flex-1 text-left">
                <div className="text-[15px] font-medium text-[var(--settings-text)]">{label}</div>
                {desc && <div className="text-xs text-[var(--settings-secondary)]">{desc}</div>}
            </div>
            {showChevron && <ChevronRight size={18} className="text-[var(--settings-secondary)]" />}
        </button>
    );
}
