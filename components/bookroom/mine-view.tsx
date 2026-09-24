"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChartColumn,
  ChevronRight,
  FileDown,
  Heart,
  MessageCircleHeart,
  Music,
  Palette,
  PenSquare,
  Quote,
  Sparkles,
} from "lucide-react";
import {
  ROLE_STATUS_LABEL,
  type CompanionRole,
} from "@/lib/bookroom-mock";
import {
  loadBookroomProfile,
  updateBookroomProfile,
  type BookroomProfile,
} from "@/lib/bookroom-profile";
import { listCoSessions, type CoReadingSession } from "@/lib/bookroom-sessions";
import { listShelfEntries } from "@/lib/bookroom-shelf";
import { getAvatarFrameTransform, getProfileBackgroundStyle, getProfileOverlayStyle } from "@/lib/bookroom-profile";
import { ProfileEditSheet } from "./profile-edit-sheet";

type Props = {
  role: CompanionRole;
  onOpenRoles: () => void;
  onOpenStats: () => void;
  onOpenHistory: () => void;
  onOpenAppearance: () => void;
  onOpenSkins: () => void;
  onOpenQuotes: () => void;
  onOpenImport: () => void;
  onOpenDesk: () => void;
  onOpenShelf: () => void;
};

/** 快捷入口项 */
const QUICK_ACTIONS = [
  { id: "stats", label: "统计", icon: ChartColumn, desc: "阅读时长与记录" },
  { id: "history", label: "共读记录", icon: MessageCircleHeart, desc: "与 TA 一起读过的书" },
  { id: "quotes", label: "收藏语录", icon: Quote, desc: "划线 / 高亮 / 笔记" },
  { id: "appearance", label: "外观工作室", icon: Palette, desc: "主题、色彩与质感" },
  { id: "skins", label: "阅读皮肤", icon: Sparkles, desc: "阅读器美化" },
  { id: "import", label: "导入内容", icon: FileDown, desc: "TXT / EPUB / PDF" },
  { id: "desk", label: "书桌", icon: PenSquare, desc: "写作与项目" },
  { id: "shelf", label: "我的书架", icon: BookOpen, desc: "已收藏的书籍" },
] as const;

/** 音乐卡片：当前项目无真实音乐源时展示连接提示 */
function MusicCard({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <section className="book-section">
      <div className="br-music-card book-glass">
        <div className="br-music-cover">
          <Music size={22} strokeWidth={1.8} />
        </div>
        <div className="br-music-info">
          <span className="br-music-title">尚未连接音乐</span>
          <span className="br-music-artist">连接音乐服务后，这里会显示正在播放</span>
        </div>
      </div>
    </section>
  );
}

/** 共读记录摘要 */
function CoReadingSummary({ sessions }: { sessions: CoReadingSession[] }) {
  if (sessions.length === 0) return null;
  const recent = sessions.slice(0, 2);
  return (
    <section className="book-section">
      <div className="book-section-head">
        <h2 className="book-section-title">最近共读</h2>
        <Heart size={14} strokeWidth={2} className="br-title-icon" />
      </div>
      <div className="br-list book-glass">
        {recent.map(s => (
          <div key={s.id} className="br-list-row">
            <span className="br-chat-avatar br-companion-avatar">
              {s.roleSnapshot?.avatar ? <img src={s.roleSnapshot.avatar} alt="" /> : (s.roleSnapshot?.name ?? "?").slice(0, 1)}
            </span>
            <span className="br-list-main">
              <span className="br-list-label">《{s.bookTitle}》</span>
              <span className="br-list-desc">{s.progress}% · {s.messageCount} 条消息</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 我的页（Phase 8A）：真实可编辑的用户主页。
 * - 资料 / 头像 / 头像框 / 背景 / 签名全部来自 bookroom-profile，可编辑；
 * - 快捷入口分层跳转，不纵向堆满；
 * - 共读记录 / 收藏语录 / 统计均为真实数据入口。
 */
export function MineView({
  role,
  onOpenRoles,
  onOpenStats,
  onOpenHistory,
  onOpenAppearance,
  onOpenSkins,
  onOpenQuotes,
  onOpenImport,
  onOpenDesk,
  onOpenShelf,
}: Props) {
  const [profile, setProfile] = useState<BookroomProfile>(() => loadBookroomProfile());
  const [editOpen, setEditOpen] = useState(false);
  const sessions = useMemo(() => listCoSessions(), []);
  const shelfCount = useMemo(() => listShelfEntries().length, []);

  const handleSave = (patch: Partial<BookroomProfile>) => {
    setProfile(updateBookroomProfile(patch));
  };

  const bgStyle = getProfileBackgroundStyle(profile.background);
  const overlayStyle = getProfileOverlayStyle(profile.background);
  const frameTransform = getAvatarFrameTransform(profile.avatarFrame);

  const handleQuickAction = (id: (typeof QUICK_ACTIONS)[number]["id"]) => {
    const map: Record<(typeof QUICK_ACTIONS)[number]["id"], () => void> = {
      stats: onOpenStats,
      history: onOpenHistory,
      quotes: onOpenQuotes,
      appearance: onOpenAppearance,
      skins: onOpenSkins,
      import: onOpenImport,
      desk: onOpenDesk,
      shelf: onOpenShelf,
    };
    map[id]?.();
  };

  return (
    <>
      {/* 背景层 */}
      {profile.background.type !== "default" && (
        <div className="br-mine-bg" style={bgStyle} aria-hidden>
          <div className="br-mine-bg-overlay" style={overlayStyle} />
        </div>
      )}

      {/* 顶部个人资料 */}
      <section className="book-section">
        <div className="br-profile book-glass br-profile-editable">
          <button type="button" className="br-profile-edit-btn book-pressable" onClick={() => setEditOpen(true)} aria-label="编辑资料">
            <PenSquare size={14} strokeWidth={2} />
          </button>
          <div className="br-profile-avatar-wrap">
            <span className="br-profile-avatar" aria-hidden>
              {profile.avatar ? <img src={profile.avatar} alt="" /> : (profile.name || "我").slice(0, 1)}
            </span>
            {profile.avatarFrame.enabled && profile.avatarFrame.src && (
              <img
                src={profile.avatarFrame.src}
                alt=""
                className="br-profile-avatar-frame"
                style={{ transform: frameTransform }}
              />
            )}
          </div>
          <div className="br-profile-main">
            <span className="br-profile-name">{profile.name || "未设置昵称"}</span>
            <span className="br-profile-handle">{profile.handle || "@未设置"}</span>
            {profile.bio && <p className="br-profile-bio">{profile.bio}</p>}
            {profile.tags.length > 0 && (
              <div className="br-profile-tags">
                {profile.tags.map(tag => (
                  <span key={tag} className="br-profile-tag">{tag}</span>
                ))}
              </div>
            )}
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
            <span className="br-list-desc">{role.name} · {ROLE_STATUS_LABEL[role.status]}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
        </button>
      </section>

      <MusicCard visible={profile.showMusicCard} />

      {/* 快捷入口 */}
      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">快捷入口</h2>
        </div>
        <div className="br-quick-grid">
          {QUICK_ACTIONS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="br-quick-card book-pressable"
                onClick={() => handleQuickAction(item.id)}
              >
                <span className="br-quick-icon" aria-hidden>
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="br-quick-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 最近共读 */}
      <CoReadingSummary sessions={sessions} />

      {/* 书架摘要 */}
      {shelfCount > 0 && (
        <section className="book-section">
          <div className="br-list book-glass">
            <button type="button" className="br-list-row book-pressable" onClick={onOpenShelf}>
              <span className="br-list-icon" aria-hidden>
                <BookOpen size={17} strokeWidth={1.9} />
              </span>
              <span className="br-list-main">
                <span className="br-list-label">我的书架</span>
                <span className="br-list-desc">{shelfCount} 本书</span>
              </span>
              <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
            </button>
          </div>
        </section>
      )}

      {/* 签名 */}
      {profile.signature && (
        <p className="br-mine-foot">
          <Heart size={11} strokeWidth={2} />
          {profile.signature}
        </p>
      )}

      {editOpen && (
        <ProfileEditSheet
          profile={profile}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
