import { useContext } from "react";
import { SettingsNavigationContext, GLASS_STYLES } from "./nav-shell";
import { ChevronRight } from "lucide-react";

import { type ReactNode } from "react";

export function SettingsListGroup({ title, children }: { title?: string, children: ReactNode }) {
    return (
        <div className="mb-6">
            {title && <h3 className="text-xs font-semibold text-[var(--c-icon)] uppercase tracking-wider ml-1 mb-2">{title}</h3>}
            <div className={GLASS_STYLES.group}>
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
        <button className={GLASS_STYLES.item} onClick={onClick}>
            <div className="w-8 h-8 rounded-lg bg-[var(--c-card-border)] flex items-center justify-center mr-3 shrink-0">
                <Icon size={18} className="text-[var(--c-text-title)]" />
            </div>
            <div className="flex-1 text-left">
                <div className="text-[15px] font-medium text-[var(--c-text)]">{label}</div>
                {desc && <div className="text-xs text-[var(--c-icon)]">{desc}</div>}
            </div>
            {showChevron && <ChevronRight size={18} className="text-[var(--c-icon)]" />}
        </button>
    );
}
