"use client";

import {
  ChartColumn,
  ChevronRight,
  Heart,
  Layers,
  Palette,
  Quote,
} from "lucide-react";
import {
  MINE_PROFILE,
  MOCK_QUOTES,
  ROLE_STATUS_LABEL,
  type CompanionRole,
} from "@/lib/bookroom-mock";

type Props = {
  role: CompanionRole;
  onOpenRoles: () => void;
  onOpenStats: () => void;
  onOpenColor: (tab: "grid" | "spectrum" | "sliders") => void;
};

const MENU_ITEMS = [
  { id: "stats", label: "统计", desc: "阅读时长、文档、翻页与字数", icon: ChartColumn, action: "stats" as const },
  { id: "appearance", label: "外观调试", desc: "卡片、玻璃质感与明暗", icon: Palette, action: "sliders" as const },
  { id: "color", label: "颜色调试", desc: "格线 / 光谱 / 滑杆", icon: Layers, action: "grid" as const },
];

/**
 * 我的页：个人主页化（非设置页）——头像 / 昵称 / @id / 简介 / 标签 /
 * 当前陪读角色 / 收藏语录 / 统计与外观入口。
 */
export function MineView({ role, onOpenRoles, onOpenStats, onOpenColor }: Props) {
  const handleMenu = (action: "stats" | "grid" | "spectrum" | "sliders") => {
    if (action === "stats") onOpenStats();
    else onOpenColor(action);
  };

  return (
    <>
      <section className="book-section">
        <div className="br-profile book-glass">
          <span className="br-profile-avatar" aria-hidden>
            {MINE_PROFILE.name.slice(0, 1)}
          </span>
          <div className="br-profile-main">
            <span className="br-profile-name">{MINE_PROFILE.name}</span>
            <span className="br-profile-handle">{MINE_PROFILE.handle}</span>
            <p className="br-profile-bio">{MINE_PROFILE.bio}</p>
            <div className="br-profile-tags">
              {MINE_PROFILE.tags.map(tag => (
                <span key={tag} className="br-profile-tag">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 当前陪读角色 */}
      <section className="book-section">
        <button type="button" className="br-companion-row book-glass book-pressable" onClick={onOpenRoles}>
          <span className="br-chat-avatar br-companion-avatar">
            {role.avatar ? <img src={role.avatar} alt="" /> : role.name.slice(0, 1)}
          </span>
          <span className="br-list-main">
            <span className="br-list-label">当前陪读角色</span>
            <span className="br-list-desc">
              {role.name} · {ROLE_STATUS_LABEL[role.status]}
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
        </button>
      </section>

      {/* 收藏语录 */}
      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">收藏语录</h2>
          <span className="br-title-icon"><Quote size={14} strokeWidth={2} /></span>
        </div>
        <div className="br-quote-list book-glass">
          {MOCK_QUOTES.map((item, index) => (
            <figure key={item.id} className={`br-quote ${index > 0 ? "is-divided" : ""}`}>
              <blockquote className="br-quote-text">{item.text}</blockquote>
              <figcaption className="br-quote-source">— {item.source}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 菜单 */}
      <section className="book-section">
        <div className="br-list book-glass">
          {MENU_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="br-list-row book-pressable"
                onClick={() => handleMenu(item.action)}
              >
                <span className="br-list-icon" aria-hidden>
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="br-list-main">
                  <span className="br-list-label">{item.label}</span>
                  <span className="br-list-desc">{item.desc}</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
              </button>
            );
          })}
        </div>
      </section>

      <p className="br-mine-foot">
        <Heart size={11} strokeWidth={2} />
        安静阅读，慢慢生活
      </p>
    </>
  );
}
