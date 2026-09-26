"use client";

import { useMemo, useState } from "react";
import {
  ChartColumn,
  ChevronRight,
  FileDown,
  Highlighter,
  MessageCircleHeart,
  Palette,
  PenSquare,
  Quote,
  Sparkles,
} from "lucide-react";
import type { CompanionRole } from "@/lib/bookroom-mock";
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
import { listReadingProgress } from "@/lib/reading-progress";
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

/** 阅读时长紧凑展示（与 stats-view 估算口径一致：进度记录数 × 15 分钟） */
function formatMinutesCompact(minutes: number): string {
  if (minutes <= 0) return "0 分";
  if (minutes < 60) return `${minutes} 分`;
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} 时`;
}

/**
 * 我的页（Phase 9B-2 减法返修）：身份主页 + 少量摘要 + iOS 设置式横向入口。
 * Hero 资料 → 阅读摘要条 → 收藏语录（2~3）→ 最近共读（1~2）→ 分组横列表。
 * 所有数据真实：shelf / reading-progress / annotations / CoReadingSession，不造 demo。
 */
export function MineView({
  onOpenStats,
  onOpenHistory,
  onOpenAppearance,
  onOpenSkins,
  onOpenQuotes,
  onOpenImport,
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
      for (const ann of anns) {
        recentQuotes.push({ id: ann.id, quote: ann.quote, bookTitle: title });
        if (recentQuotes.length >= 3) break;
      }
      if (recentQuotes.length >= 3) break;
    }
    return {
      readingCount: entries.filter(e => e.status === "reading").length,
      finishedCount: entries.filter(e => e.status === "finished").length,
      favoriteCount: entries.filter(e => e.favorite).length,
      minutes: listReadingProgress().length * 15,
      annotationCount,
      quotePreview: recentQuotes,
      sessions: sessions.slice(0, 2),
      isEmpty: entries.length === 0 && sessions.length === 0 && annotationCount === 0,
    };
  }, []);

  const handleSave = (patch: Partial<BookroomProfile>) => {
    setProfile(updateBookroomProfile(patch));
  };

  const bgStyle = getProfileBackgroundStyle(profile.background);
  const overlayStyle = getProfileOverlayStyle(profile.background);
  const frameTransform = getAvatarFrameTransform(profile.avatarFrame);

  return (
    <>
      {/* 背景层 */}
      {profile.background.type !== "default" && (
        <div className="br-mine-bg" style={bgStyle} aria-hidden>
          <div className="br-mine-bg-overlay" style={overlayStyle} />
        </div>
      )}

      {/* Hero 身份区 */}
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
                {profile.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="br-profile-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="br-profile-edit-main book-pressable" onClick={() => setEditOpen(true)}>
            编辑资料
          </button>
        </div>
      </section>

      {/* 摘要条：阅读中 / 已读 / 收藏 / 阅读时长（点击进入完整统计页） */}
      <section className="book-section">
        <button type="button" className="br-stats-strip book-glass book-pressable" onClick={onOpenStats}>
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.readingCount}</span>
            <span className="br-stats-label">阅读中</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.finishedCount}</span>
            <span className="br-stats-label">已读</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell">
            <span className="br-stats-num">{summary.favoriteCount}</span>
            <span className="br-stats-label">收藏</span>
          </span>
          <span className="br-stats-sep" aria-hidden />
          <span className="br-stats-cell">
            <span className="br-stats-num">{formatMinutesCompact(summary.minutes)}</span>
            <span className="br-stats-label">阅读时长</span>
          </span>
        </button>
      </section>

      {/* 收藏语录：主页最多 3 条 */}
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

      {/* 最近共读：主页最多 2 条 */}
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

      {/* iOS 设置式横向入口（分组） */}
      <section className="book-section">
        <div className="br-mine-group book-glass">
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenQuotes}>
            <span className="br-mine-row-icon"><Quote size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">收藏语录</span>
              {summary.annotationCount > 0 && <span className="br-mine-row-sub">{summary.annotationCount} 条</span>}
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
          <span className="br-mine-row-divider" aria-hidden />
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenHistory}>
            <span className="br-mine-row-icon"><MessageCircleHeart size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">共读记录</span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
          <span className="br-mine-row-divider" aria-hidden />
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenStats}>
            <span className="br-mine-row-icon"><ChartColumn size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">阅读统计</span>
              <span className="br-mine-row-sub">{formatMinutesCompact(summary.minutes)}</span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
        </div>

        <div className="br-mine-group book-glass">
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenAppearance}>
            <span className="br-mine-row-icon"><Palette size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">外观工作室</span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
          <span className="br-mine-row-divider" aria-hidden />
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenSkins}>
            <span className="br-mine-row-icon"><Sparkles size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">阅读皮肤</span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
        </div>

        <div className="br-mine-group book-glass">
          <button type="button" className="br-mine-row book-pressable" onClick={onOpenImport}>
            <span className="br-mine-row-icon"><FileDown size={16} strokeWidth={1.9} /></span>
            <span className="br-mine-row-main">
              <span className="br-mine-row-label">导入与书架管理</span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="br-mine-row-arrow" />
          </button>
        </div>
      </section>

      {/* 真实空状态（不造数据） */}
      {summary.isEmpty && (
        <div className="br-mine-empty book-glass">
          <Highlighter size={18} strokeWidth={1.8} />
          <span>开始你的第一本阅读，标注与共读会慢慢出现在这里。</span>
        </div>
      )}

      {/* 用户自定义签名（非装饰文案，可在编辑资料中关闭） */}
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
