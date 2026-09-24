"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  MessageCircleHeart,
} from "lucide-react";
import {
  buildCoSessionSummary,
  finishCoSession,
  listCoSessions,
  type CoReadingSession,
  type CoReadingStatus,
} from "@/lib/bookroom-sessions";
import { loadCoSession, type CoSessionMessage } from "@/lib/bookroom-co-session";
import { resolveShelfBook } from "@/lib/bookroom-shelf";
import { resolveRoleDisplayById } from "@/lib/bookroom-mock";
import { loadMemoryEntries } from "@/lib/memory-storage";
import type { MemoryEntry } from "@/lib/memory-types";

type Props = {
  onBack: () => void;
  /** 继续共读：由 app 层解析书籍、切换陪读角色并打开共读聊天层 */
  onResumeCoRead: (session: CoReadingSession) => void;
  /** 回到阅读位置：由 app 层解析书籍并打开阅读器 / 详情 */
  onBackToReading: (session: CoReadingSession) => void;
};

const STATUS_LABEL: Record<CoReadingStatus, string> = {
  active: "共读中",
  paused: "已暂停",
  finished: "已结束",
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

/** 共读范围文案：从起点章节 / 页 → 当前章节 / 页 */
function formatRange(session: CoReadingSession): string {
  if (session.contentType === "manga") {
    const from = (session.startPageIndex ?? 0) + 1;
    const to = (session.pageIndex ?? session.startPageIndex ?? 0) + 1;
    return from === to ? `第 ${to} 页` : `第 ${from} 页 → 第 ${to} 页`;
  }
  const from = (session.startChapterIndex ?? 0) + 1;
  const to = (session.chapterIndex ?? session.startChapterIndex ?? 0) + 1;
  return from === to ? `第 ${to} 章` : `第 ${from} 章 → 第 ${to} 章`;
}

function RoleAvatarChip({ roleId, snapshot }: { roleId: string; snapshot?: { name: string; avatar?: string | null } }) {
  const display = resolveRoleDisplayById(roleId, snapshot);
  return (
    <span className="br-chat-avatar br-cohist-avatar" aria-hidden>
      {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
    </span>
  );
}

/** 该会话关联的长期记忆（source=bookroom，按 sessionId 优先、内容 id 兜底） */
function useSessionMemories(session: CoReadingSession | null): MemoryEntry[] | null {
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  useEffect(() => {
    if (!session) {
      setMemories(null);
      return;
    }
    let alive = true;
    loadMemoryEntries(session.roleId)
      .then(entries => {
        if (!alive) return;
        const related = entries.filter(entry => {
          const meta = (entry.metadata ?? {}) as Record<string, unknown>;
          if (meta.source !== "bookroom") return false;
          if (meta.sessionId) return meta.sessionId === session.id;
          return meta.contentId === session.bookId;
        });
        setMemories(related.slice(-6).reverse());
      })
      .catch(() => {
        if (alive) setMemories([]);
      });
    return () => {
      alive = false;
    };
  }, [session]);
  return memories;
}

/**
 * 共读记录页（Phase 5B）：真实 CoReadingSession 列表 + 详情。
 * - 角色显示实时解析 canonical 角色卡；角色已删除时回退历史快照并明确标注；
 * - 书籍以 metadata 快照展示，书被删除时不崩、仅禁用进入正文的操作；
 * - 聊天消息仍由 bookroom-co-session 读取，本页不复制聊天数据。
 */
export function CoReadingHistoryView({ onBack, onResumeCoRead, onBackToReading }: Props) {
  const [sessions, setSessions] = useState<CoReadingSession[]>(() => listCoSessions());
  const [detailId, setDetailId] = useState<string | null>(null);

  const refresh = () => setSessions(listCoSessions());

  const detail = detailId ? sessions.find(s => s.id === detailId) ?? null : null;
  const detailMessages: CoSessionMessage[] = detail
    ? loadCoSession(detail.roleId, detail.bookId).slice(-6)
    : [];
  const memories = useSessionMemories(detail);

  const handleFinish = (session: CoReadingSession) => {
    const msgs = loadCoSession(session.roleId, session.bookId);
    const userTexts = msgs.filter(m => m.role === "user").map(m => m.content);
    finishCoSession(session.id, buildCoSessionSummary(session, userTexts));
    refresh();
  };

  /* ───────────────────────── 详情 ───────────────────────── */

  if (detail) {
    const roleDisplay = resolveRoleDisplayById(detail.roleId, detail.roleSnapshot);
    const bookExists = resolveShelfBook(detail.bookId) !== null;
    const canResume = bookExists && !roleDisplay.removed;
    return (
      <div className="br-page br-cohist">
        <header className="book-header br-header">
          <div className="book-appbar">
            <button
              className="book-icon-btn book-pressable"
              type="button"
              onClick={() => setDetailId(null)}
              aria-label="返回共读记录"
            >
              <ChevronLeft size={18} strokeWidth={2.2} />
            </button>
            <span className="br-cohist-appbar-title">共读详情</span>
            <span className={`br-cohist-status is-${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
          </div>
        </header>

        <div className="book-body br-body">
          <section className="book-section">
            <div className="br-cohist-hero book-glass">
              <div className="br-cohist-hero-role">
                <RoleAvatarChip roleId={detail.roleId} snapshot={detail.roleSnapshot} />
                <span className="br-list-main">
                  <span className="br-list-label">
                    {roleDisplay.name}
                    {roleDisplay.removed && <em className="br-cohist-removed">该角色已移除</em>}
                  </span>
                  <span className="br-list-desc">{roleDisplay.subtitle}</span>
                </span>
              </div>
              <div className="br-cohist-hero-book">
                <span className="br-cohist-book-title">《{detail.bookTitle}》</span>
                <span className="br-cohist-book-sub">
                  {detail.bookAuthor} · {detail.contentType === "manga" ? "漫画" : "书籍"}
                </span>
              </div>
              <div className="br-cohist-progress-row">
                <span className="br-cohist-progress-bar">
                  <span style={{ width: `${Math.min(100, Math.max(0, detail.progress))}%` }} />
                </span>
                <span className="br-cohist-progress-num">{detail.progress}%</span>
              </div>
              <dl className="br-cohist-facts">
                <div><dt>开始</dt><dd>{formatDateTime(detail.startedAt)}</dd></div>
                <div><dt>最近共读</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div>
                {detail.endedAt && <div><dt>结束</dt><dd>{formatDateTime(detail.endedAt)}</dd></div>}
                <div><dt>共读范围</dt><dd>{formatRange(detail)}</dd></div>
                <div><dt>消息</dt><dd>{detail.messageCount} 条</dd></div>
              </dl>
              {detail.summary && <p className="br-cohist-summary">{detail.summary}</p>}
            </div>
          </section>

          {/* 最近互动 */}
          <section className="book-section">
            <div className="book-section-head">
              <h2 className="book-section-title">最近互动</h2>
            </div>
            <div className="br-cohist-msgs book-glass">
              {detailMessages.length === 0 && <p className="br-cohist-none">暂无对话</p>}
              {detailMessages.map(message => (
                <p key={message.id} className={`br-cohist-msg ${message.role === "user" ? "is-mine" : ""}`}>
                  <b>{message.role === "user" ? "我" : roleDisplay.name}</b>
                  {message.content}
                </p>
              ))}
            </div>
          </section>

          {/* 已保存的重要记忆 */}
          <section className="book-section">
            <div className="book-section-head">
              <h2 className="book-section-title">已保存的重要记忆</h2>
            </div>
            <div className="br-cohist-msgs book-glass">
              {memories === null && <p className="br-cohist-none">读取中…</p>}
              {memories !== null && memories.length === 0 && (
                <p className="br-cohist-none">本次共读还没有写入长期记忆</p>
              )}
              {memories?.map(entry => (
                <p key={entry.id} className="br-cohist-msg">{entry.content}</p>
              ))}
            </div>
          </section>

          {/* 操作 */}
          <section className="book-section">
            <div className="br-cohist-actions">
              <button
                type="button"
                className="br-cohist-action book-pressable"
                disabled={!canResume}
                onClick={() => canResume && onResumeCoRead(detail)}
              >
                <MessageCircleHeart size={15} strokeWidth={2} />
                {roleDisplay.removed ? "角色已移除，无法继续共读" : bookExists ? "继续共读" : "书籍已删除，无法继续"}
              </button>
              <button
                type="button"
                className="br-cohist-action book-pressable"
                disabled={!bookExists}
                onClick={() => bookExists && onBackToReading(detail)}
              >
                <BookOpen size={15} strokeWidth={2} />
                {bookExists ? "回到阅读位置" : "书籍已删除"}
              </button>
              {detail.status !== "finished" && (
                <button
                  type="button"
                  className="br-cohist-action is-danger book-pressable"
                  onClick={() => handleFinish(detail)}
                >
                  <CircleStop size={15} strokeWidth={2} />
                  结束共读
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ───────────────────────── 列表 ───────────────────────── */

  return (
    <div className="br-page br-cohist">
      <header className="book-header br-header">
        <div className="book-appbar">
          <button
            className="book-icon-btn book-pressable"
            type="button"
            onClick={onBack}
            aria-label="返回我的"
          >
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <span className="br-cohist-appbar-title">共读记录</span>
          <span className="br-cohist-count">{sessions.length} 段</span>
        </div>
      </header>

      <div className="book-body br-body">
        {sessions.length === 0 ? (
          <div className="br-cohist-empty">
            <p>还没有共读记录</p>
            <p className="br-cohist-empty-sub">在书籍详情选择一位陪读角色，开始「一起读」。</p>
          </div>
        ) : (
          <section className="book-section">
            <div className="br-list book-glass">
              {sessions.map(session => {
                const roleDisplay = resolveRoleDisplayById(session.roleId, session.roleSnapshot);
                return (
                  <button
                    key={session.id}
                    type="button"
                    className="br-list-row book-pressable"
                    onClick={() => setDetailId(session.id)}
                  >
                    <RoleAvatarChip roleId={session.roleId} snapshot={session.roleSnapshot} />
                    <span className="br-list-main">
                      <span className="br-list-label">
                        《{session.bookTitle}》
                        <em className="br-cohist-kind">{session.contentType === "manga" ? "漫画" : "书籍"}</em>
                      </span>
                      <span className="br-list-desc">
                        与 {roleDisplay.name}
                        {roleDisplay.removed && "（已移除）"}
                        {" · "}{formatDateTime(session.updatedAt).slice(0, 10)}
                        {" · "}{session.progress}% · {session.messageCount} 条
                      </span>
                    </span>
                    <span className={`br-cohist-status is-${session.status}`}>
                      {STATUS_LABEL[session.status]}
                    </span>
                    <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
