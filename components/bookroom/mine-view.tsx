"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChartColumn,
  ChevronRight,
  FileDown,
  Highlighter,
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
  getAvatarFrameTransform,
  getProfileBackgroundStyle,
  getProfileOverlayStyle,
  type BookroomProfile,
} from "@/lib/bookroom-profile";
import { listCoSessions } from "@/lib/bookroom-sessions";
import { listShelfEntries, resolveShelfBook } from "@/lib/bookroom-shelf";
import { loadBookAnnotations } from "@/lib/bookroom-annotations";
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

/** 快捷入口项（2×4 网格） */
const QUICK_ACTIONS = [
  { id: "stats", label: "统计", icon: ChartColumn },
  { id: "history", label: "共读记录", icon: MessageCircleHeart },
  { id: "quotes", label: "收藏语录", icon: Quote },
  { id: "appearance", label: "外观工作室", icon: Palette },
  { id: "skins", label: "阅读皮肤", icon: Sparkles },
  { id: "import", label: "导入内容", icon: FileDown },
  { id: "desk", label: "书桌", icon: PenSquare },
  { id: "shelf", label: "我的书架", icon: BookOpen },
] as const;

/** 音乐卡片：当前项目无真实音乐源时展示连接提示，不伪造播放 */
function MusicCard() {
  return (
    <div className="br-music-card book-glass">
      <div className="br-music-cover">
        <Music size={20} strokeWidth={1.8} />
      </div>
      <div className="br-music-info">
        <span className="br-music-title">尚未连接音乐</span>
        <span className="br-music-artist">连接音乐服务后，这里会显示正在播放</span>
      </div>
    </div>
  );
}

/**
 * 我的页（Phase 8B 最终布局）：首页只看摘要，细节点进去。
 * Hero 资料 → 统计摘要条 → 音乐 → 快捷入口 → 收藏语录预览（1~3）→ 最近共读（1~2）。
 * 所有数据真实：shelf / reading-progress / annotations / CoReadingSession。
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

  /** 一次性聚合主页摘要所需真实数据 */
  const summary = useMemo(() => {
    const entries = listShelfEntries();
    const sessions = listCoSessions();
    let annotationCount = 0;
    const recentQuotes: { quote: string; bookTitle: string; id: string }[] = [];
    for (const entry of entries) {
      const anns = loadBookAnnotations(entry.bookId);
      annotationCount += anns.length;
      const title = resolveShelfBook(entry.bookId)?.title ?? "未知书名";
      for (const ann of anns.slice(0, 2)) {
        recentQuotes.push({
          id: ann.id,
          quote: ann.quote,
          bookTitle: title,
        });
        if (recentQuotes.length >= 2) break;
      }
      if (recentQuotes.length >= 2) break;
    }
    const readingCount = entries.filter(e => e.status === "reading").length;
    return {
      shelfCount: entries.length,
      readingCount,
      annotationCount,
      quotePreview: recentQuotes,
      sessions: sessions.slice(0, 2),
    };
  }, []);

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

      {/* Hero 资料卡 */}
      <section className="book-section">
        <div className="br-profile br-profile-hero book-glass br-profile-editable">
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

      {/* 统计摘要条：点击进入完整统计页 */}
      <section className="book-section">
        <button type="button" className="br-stats-strip book-glass book-pressable" onClick={onOpenStats}>
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.shelfCount}</span>
            <span className="br-stats-label">藏书</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.readingCount}</span>
            <span className="br-stats-label">阅读中</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.annotationCount}</span>
            <span className="br-stats-label">标注</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell br-stats-cell-more">
            <ChartColumn size={15} strokeWidth={2} />
            <span className="br-stats-label">统计</span>
          </span>
        </button>
      </section>

      {/* 当前陪读角色 + 音乐（同一紧凑行） */}
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
        {profile.showMusicCard && (
          <div className="br-music-wrap">
            <MusicCard />
          </div>
        )}
      </section>

      {/* 快捷入口 */}
      <section className="book-section">
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

      {/* 收藏语录预览：主页最多 3 条，点击进入完整页 */}
      {summary.quotePreview.length > 0 && (
        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">收藏语录</h2>
            <button type="button" className="br-section-more book-pressable" onClick={onOpenQuotes}>
              全部 <ChevronRight size={13} strokeWidth={2.2} />
            </button>
          </div>
          <div className="br-quote-preview book-glass">
            {summary.quotePreview.map(q => (
              <button
                key={q.id}
                type="button"
                className="br-quote-item book-pressable"
                onClick={onOpenQuotes}
              >
                <Quote size={13} strokeWidth={2} className="br-quote-mark" />
                <span className="br-quote-text">{q.quote}</span>
                <span className="br-quote-src">《{q.bookTitle}》</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 最近共读：最多 2 条摘要 */}
      {summary.sessions.length > 0 && (
        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">最近共读</h2>
            <button type="button" className="br-section-more book-pressable" onClick={onOpenHistory}>
              全部 <ChevronRight size={13} strokeWidth={2.2} />
            </button>
          </div>
          <div className="br-list book-glass">
            {summary.sessions.map(s => (
              <button
                key={s.id}
                type="button"
                className="br-list-row book-pressable"
                onClick={onOpenHistory}
              >
                <span className="br-chat-avatar br-companion-avatar">
                  {s.roleSnapshot?.avatar ? <img src={s.roleSnapshot.avatar} alt="" /> : (s.roleSnapshot?.name ?? "?").slice(0, 1)}
                </span>
                <span className="br-list-main">
                  <span className="br-list-label">《{s.bookTitle}》</span>
                  <span className="br-list-desc">{s.progress}% · {s.messageCount} 条消息</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 无任何内容时的轻提示（真实空状态，不造数据） */}
      {summary.annotationCount === 0 && summary.sessions.length === 0 && summary.shelfCount === 0 && (
        <div className="br-mine-empty book-glass">
          <Highlighter size={18} strokeWidth={1.8} />
          <span>开始你的第一本阅读，标注与共读会慢慢出现在这里。</span>
        </div>
      )}

      {/* 签名（用户自定义，可关闭） */}
      {profile.signature && (
        <p className="br-mine-foot">{profile.signature}</p>
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
