"use client";

import { Library, PenLine, Store, User } from "lucide-react";

export type BookroomTab = "shelf" | "store" | "desk" | "mine";

const DOCK_ITEMS: { id: BookroomTab; label: string; icon: typeof Library }[] = [
  { id: "shelf", label: "书架", icon: Library },
  { id: "store", label: "书城", icon: Store },
  { id: "desk", label: "书桌", icon: PenLine },
  { id: "mine", label: "我的", icon: User },
];

type Props = {
  active: BookroomTab;
  onChange: (tab: BookroomTab) => void;
};

/**
 * 书房一级导航：固定 4 个入口（书架 / 书城 / 书桌 / 我的）。
 * 悬浮奶白磨砂条，跟随底部安全区；夜读 / 共读等工具层不进入 Dock。
 */
export function BookroomDock({ active, onChange }: Props) {
  return (
    <nav className="br-dock" aria-label="书房导航">
      <div className="br-dock-inner book-glass">
        {DOCK_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              className={`br-dock-item book-pressable ${isActive ? "is-active" : ""}`}
              onClick={() => onChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.9} />
              <span className="br-dock-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
