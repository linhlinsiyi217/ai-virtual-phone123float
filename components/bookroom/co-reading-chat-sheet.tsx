"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bookmark,
  ChevronLeft,
  MessageCircleHeart,
  MoreHorizontal,
  Plus,
  Sparkles,
} from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { isRealCompanionRole, resolveRoleDisplayById, type CompanionRole } from "@/lib/bookroom-mock";
import {
  buildBookRoomContentRef,
  buildBookRoomGreeting,
  detectNotableBookroomEvent,
  generateBookRoomReply,
  recordBookroomMemoryEvent,
  BookRoomAiError,
} from "@/lib/bookroom-ai-context";
import {
  appendCoSessionMessage,
  loadCoSession,
  type CoSessionMessage,
} from "@/lib/bookroom-co-session";
import {
  startOrResumeCoSession,
  syncCoSessionMessageCount,
  pauseCoSession,
  type CoReadingSession,
} from "@/lib/bookroom-sessions";
import { BottomSheet } from "./bookroom-ui";

/** Phase 9B：聊天时间分隔标签（iMessage 风格：今天显示时分，跨天带月日） */
function formatChatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

/** 左滑查看时间戳时，单条消息显示到分钟 */
function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 连续消息分组间隔：超过 5 分钟即另起一组（尾巴/头像只在组末出现） */
const GROUP_GAP = 5 * 60 * 1000;

type Props = {
  book: Book;
  role: CompanionRole;
  /** book=「一起读」；manga=「一起看漫画」 */
  kind: "book" | "manga";
  /** 当前不是真实 Float 角色时，引导用户去角色侧栏选择 */
  onChooseRole: () => void;
  /** 阅读器划词「问 TA」：打开时自动发送的问题（含选中原文） */
  initialAsk?: string;
  /** Phase 9A：sheet=底部半弹层（默认）；drawer=阅读页右侧滑出聊天室 */
  variant?: "sheet" | "drawer";
  onClose: () => void;
};

type UiMessage = CoSessionMessage;

type ErrorState = {
  /** 发送失败的那条用户消息（用于 retry） */
  failedText: string;
  /** 该用户消息是否已落盘（retry 时避免重复追加） */
  persisted: boolean;
  message: string;
  /** 是否允许「重试」（取消 / 无角色不可重试） */
  retryable: boolean;
  /** 是否引导去选择角色 */
  chooseRole: boolean;
};

function friendlyError(error: unknown): string {
  if (error instanceof BookRoomAiError) {
    if (error.code === "no-config") return "AI 还没有配置好，请先在设置中为该角色绑定 API。";
    if (error.code === "aborted") return "已取消。";
    return "AI 暂时没有回应，稍后再试。";
  }
  return "AI 暂时没有回应，稍后再试。";
}

/**
 * 共读 / 共看聊天层（真实 AI + 共读会话记录）。
 * Phase 9B-2：iMessage 化 —— 连续消息分组、克制小尾巴、稀疏时间分隔、
 * 左滑显示逐条时间、已送达、+ / 自适应输入框 / 圆形发送；抽屉支持右拖关闭。
 */
export function CoReadingChatSheet({ book, role, kind, onChooseRole, initialAsk, variant = "sheet", onClose }: Props) {
  const contentRef = useMemo(() => buildBookRoomContentRef(book), [book]);
  const roleReady = isRealCompanionRole(role.id);
  // 角色显示永远实时读真源；role prop 仅作为 id 入口
  const display = resolveRoleDisplayById(role.id);

  const [session, setSession] = useState<CoReadingSession | null>(null);
  const sessionRef = useRef<CoReadingSession | null>(null);
  sessionRef.current = session;

  const [messages, setMessages] = useState<UiMessage[]>(() => {
    const existing = loadCoSession(role.id, book.id);
    if (existing.length > 0) return existing;
    // 本地开场白（非 AI 请求），落盘以保持上下文连续
    return appendCoSessionMessage(role.id, book.id, {
      role: "assistant",
      content: buildBookRoomGreeting(display.name, contentRef),
    });
  });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [revealTime, setRevealTime] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const initialAskFiredRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean; locked: boolean } | null>(null);

  // 打开共读层：真实角色才开始 / 继续共读会话；关闭层 = 暂停会话（下次优先继续）
  useEffect(() => {
    if (!isRealCompanionRole(role.id)) return;
    const { session: started, resumed } = startOrResumeCoSession(role.id, book, {
      chapterIndex: contentRef.chapterIndex,
      pageIndex: contentRef.pageIndex,
      progress: contentRef.progressPercent,
    });
    setSession(started);
    if (resumed) flashHint("已继续上次的共读");
    return () => {
      pauseCoSession(started.id);
    };
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id, book.id]);

  // 会话消息数同步到 CoReadingSession（消息本体仍在 bookroom-co-session）
  useEffect(() => {
    const current = sessionRef.current;
    if (!current) return;
    syncCoSessionMessageCount(
      current.id,
      messages.length,
      contentRef.currentExcerpt || contentRef.pageCaption || undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  /* 输入框随内容增高，到 96px 后内部滚动 */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(96, el.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const flashHint = (text: string) => {
    setHint(text);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setHint(null), 1600);
  };

  /**
   * 统一 AI 请求。
   * @param persistedUser 该用户消息是否已经在会话中（retry 时为 true，避免重复落盘）
   */
  const requestReply = async (userText: string, persistedUser: boolean) => {
    if (sendingRef.current) return;
    if (!roleReady) {
      setError({ failedText: userText, persisted: persistedUser, message: "先选择一位陪读角色。", retryable: false, chooseRole: true });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setPlusOpen(false);
    setMoreOpen(false);

    const before = loadCoSession(role.id, book.id);
    if (!persistedUser) {
      setMessages(appendCoSessionMessage(role.id, book.id, { role: "user", content: userText }));
    }
    setDraft("");

    const controller = new AbortController();
    abortRef.current = controller;

    // retry 时失败的用户消息已在会话末尾，避免与 userText 重复传给模型
    const historyForAi = persistedUser
      && before.length > 0
      && before[before.length - 1].role === "user"
      ? before.slice(0, -1)
      : before;

    try {
      const { reply } = await generateBookRoomReply({
        roleId: role.id,
        content: contentRef,
        history: historyForAi,
        userText,
        signal: controller.signal,
      });
      const next = appendCoSessionMessage(role.id, book.id, { role: "assistant", content: reply });
      setMessages(next);

      // 选择性长期记忆写回：仅显式要求记住 / 强烈好恶，失败静默不影响聊天
      const notable = detectNotableBookroomEvent(userText, contentRef);
      if (notable) {
        await recordBookroomMemoryEvent({
          roleId: role.id,
          content: contentRef,
          kind: notable.kind,
          summary: notable.summary,
          importance: notable.importance,
          sessionId: sessionRef.current?.id,
        }).catch(() => undefined);
      }
    } catch (requestError) {
      const code = requestError instanceof BookRoomAiError ? requestError.code : "failed";
      setError({
        failedText: userText,
        persisted: true,
        message: friendlyError(requestError),
        retryable: code !== "aborted" && code !== "no-character",
        chooseRole: code === "no-character",
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
      abortRef.current = null;
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    void requestReply(content, false);
  };

  const retry = () => {
    if (!error || sending) return;
    const failedText = error.failedText;
    setError(null);
    void requestReply(failedText, true);
  };

  const askRole = () => {
    if (sending) return;
    setMoreOpen(false);
    send(kind === "manga"
      ? "你怎么看现在这一格分镜？想听听你的感受。"
      : "你怎么看现在这一段？想听听你的感受。");
  };

  const companionFeedback = () => {
    if (sending) return;
    setMoreOpen(false);
    send("我想听听你此刻陪我读的心情。");
  };

  /* Phase 9B：快捷提问 chips —— 问这一段 / 总结 / 解释 / 陪我聊聊 */
  const quickAsk = (preset: "segment" | "summary" | "explain" | "chat") => {
    if (sending) return;
    const excerpt = (contentRef.currentExcerpt || contentRef.pageCaption || "").slice(0, 160);
    switch (preset) {
      case "segment":
        send(excerpt
          ? `读到这一段：「${excerpt}」\n想听听你的感受。`
          : "想听听你对现在这一段落的感受。");
        break;
      case "summary":
        send("帮我轻轻总结一下我们目前读到的内容吧。");
        break;
      case "explain":
        send(excerpt
          ? `这一段我读得不太明白：「${excerpt}」\n你能帮我解释一下吗？`
          : "这一段我读得不太明白，你能帮我解释一下吗？");
        break;
      case "chat":
        send("先不聊书了，陪我聊聊吧。");
        break;
    }
  };

  /* 引用当前段落进输入框（不自动发送） */
  const quoteCurrent = () => {
    const excerpt = (contentRef.currentExcerpt || contentRef.pageCaption || "").slice(0, 120);
    setPlusOpen(false);
    if (!excerpt) {
      flashHint("当前位置暂无可引用的段落");
      return;
    }
    setDraft(d => `「${excerpt}」${d}`);
    textareaRef.current?.focus();
  };

  /* 消息区左滑：显示每条详细时间；右滑收回 */
  const onListTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, active: true, locked: false };
  };
  const onListTouchMove = (e: React.TouchEvent) => {
    const st = dragRef.current;
    if (!st?.active) return;
    const t = e.touches[0];
    const dx = t.clientX - st.startX;
    const dy = t.clientY - st.startY;
    if (!st.locked) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) st.locked = true;
      else if (Math.abs(dy) > 8) st.active = false;
    }
    if (st.locked) {
      e.preventDefault();
      if (dx < -48) setRevealTime(true);
      else if (dx > 48) setRevealTime(false);
    }
  };
  const onListTouchEnd = () => {
    dragRef.current = null;
  };

  /* 抽屉：从头部右拖关闭（transform/opacity，可中断，reduced-motion 由 CSS 降级） */
  const onHeadPointerDown = (e: React.PointerEvent) => {
    if (variant !== "drawer") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: true, locked: false };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const st = dragRef.current;
      if (!st?.active) return;
      const dx = ev.clientX - st.startX;
      const dy = ev.clientY - st.startY;
      if (!st.locked) {
        if (dx > 6 && Math.abs(dx) > Math.abs(dy) * 1.3) st.locked = true;
        else if (Math.abs(dy) > 10) st.active = false;
      }
      if (st.locked) setDragX(Math.max(0, dx));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const st = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      const width = listRef.current?.parentElement?.offsetWidth ?? 320;
      if (st?.locked && ev.clientX - st.startX > width * 0.28) {
        onClose();
      } else {
        setDragX(0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 阅读器划词「问 TA」：挂载后自动发送一次；未选真实角色则先填入输入框
  useEffect(() => {
    if (!initialAsk || initialAskFiredRef.current) return;
    initialAskFiredRef.current = true;
    if (isRealCompanionRole(role.id)) {
      void requestReply(initialAsk.trim(), false);
    } else {
      setDraft(initialAsk.trim());
    }
    // 只在挂载时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 最后一条非系统消息是否为“我”（用于已送达） */
  const lastIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role !== "system") return i;
    }
    return -1;
  })();

  const chatBody = (
    <>
      <div className="br-chat-head" onPointerDown={onHeadPointerDown}>
        <button
          type="button"
          className="book-icon-btn book-pressable br-chat-close"
          onClick={onClose}
          aria-label="关闭聊天"
        >
          {variant === "drawer" ? <ChevronLeft size={18} strokeWidth={2} /> : undefined}
          {variant !== "drawer" ? <span aria-hidden>×</span> : null}
        </button>
        <span className="br-chat-who-center">
          <span className="br-chat-avatar">
            {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
          </span>
          <span className="br-chat-who-text">
            <span className="br-chat-name">{display.name}</span>
            <span className="br-chat-sub">
              <span className={`br-role-dot ${sending ? "br-role-dot-online" : "br-role-dot-reading"}`} />
              {sending ? "正在输入…" : "共读中"}
            </span>
          </span>
        </span>
        <span className="br-chat-more-wrap">
          <button
            type="button"
            className="book-icon-btn book-pressable br-chat-more-btn"
            onClick={() => setMoreOpen(v => !v)}
            aria-label="更多操作"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={17} strokeWidth={2} />
          </button>
          {moreOpen && (
            <span className="br-chat-menu">
              <button type="button" className="br-chat-menu-item book-pressable" onClick={askRole} disabled={!roleReady || sending}>
                <Sparkles size={13} strokeWidth={2} />
                问 TA
              </button>
              <button
                type="button"
                className="br-chat-menu-item book-pressable"
                onClick={() => { setMoreOpen(false); flashHint("已为这一段轻轻记下批注"); }}
              >
                <Bookmark size={13} strokeWidth={2} />
                批注
              </button>
              <button type="button" className="br-chat-menu-item book-pressable" onClick={companionFeedback} disabled={!roleReady || sending}>
                <MessageCircleHeart size={13} strokeWidth={2} />
                陪伴反馈
              </button>
            </span>
          )}
        </span>
      </div>

      <div
        className={`br-chat-list ${revealTime ? "is-time-reveal" : ""}`}
        ref={listRef}
        onTouchStart={onListTouchStart}
        onTouchMove={onListTouchMove}
        onTouchEnd={onListTouchEnd}
      >
        {messages.map((message, index) => {
          if (message.role === "system") {
            return <p key={message.id} className="br-chat-system">{message.content}</p>;
          }
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const mine = message.role === "user";
          const sameWith = (other?: UiMessage) =>
            Boolean(other && other.role !== "system" && other.role === message.role);
          const crossDayFromPrev = prev
            ? new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
            : false;
          const groupStart = !sameWith(prev)
            || message.createdAt - (prev?.createdAt ?? 0) > GROUP_GAP
            || crossDayFromPrev;
          const groupEnd = !sameWith(next) || (next?.createdAt ?? 0) - message.createdAt > GROUP_GAP;
          const showTime = !prev || prev.role === "system"
            || message.createdAt - prev.createdAt > GROUP_GAP
            || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
          const groupClass = groupStart && groupEnd
            ? "is-group-single"
            : groupStart ? "is-group-first"
            : groupEnd ? "is-group-last"
            : "is-group-middle";

          return (
            <Fragment key={message.id}>
              {showTime && (
                <p className="br-chat-time">{formatChatTime(message.createdAt)}</p>
              )}
              <div className={`br-chat-row ${mine ? "is-mine" : "is-other"} ${groupClass}`}>
                {!mine && (
                  groupEnd ? (
                    <span className="br-chat-bubble-avatar">
                      {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
                    </span>
                  ) : <span className="br-chat-bubble-avatar is-placeholder" aria-hidden />
                )}
                <span className="br-chat-bubble-col">
                  <span className="br-chat-bubble">{message.content}</span>
                  <span className="br-chat-stamp">{formatStamp(message.createdAt)}</span>
                </span>
              </div>
              {mine && index === lastIndex && !sending && !error && (
                <p className="br-chat-delivered">已送达</p>
              )}
            </Fragment>
          );
        })}

        {sending && (
          <div className="br-chat-row is-other is-group-single">
            <span className="br-chat-bubble-avatar">
              {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
            </span>
            <span className="br-chat-bubble-col">
              <span className="br-chat-bubble br-chat-bubble-typing" aria-label="对方正在输入">
                <i />
                <i />
                <i />
              </span>
            </span>
          </div>
        )}

        {error && (
          <div className="br-chat-row is-other is-group-single">
            <span className="br-chat-bubble-avatar">
              {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
            </span>
            <span className="br-chat-error">
              <span className="br-chat-error-text">{error.message}</span>
              {error.retryable && (
                <button type="button" className="br-chat-retry book-pressable" onClick={retry}>
                  重试
                </button>
              )}
              {error.chooseRole && (
                <button type="button" className="br-chat-retry book-pressable" onClick={onChooseRole}>
                  选择角色
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      {roleReady && (
        <div className="br-chat-quick" role="group" aria-label="快捷提问">
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("segment")} disabled={sending}>问这一段</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("summary")} disabled={sending}>总结</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("explain")} disabled={sending}>解释</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("chat")} disabled={sending}>陪我聊</button>
        </div>
      )}

      {roleReady ? (
        <div className="br-chat-inputbar">
          <span className="br-chat-plus-wrap">
            <button
              type="button"
              className={`br-chat-plus book-pressable ${plusOpen ? "is-active" : ""}`}
              onClick={() => setPlusOpen(v => !v)}
              aria-label="更多输入操作"
              aria-expanded={plusOpen}
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            {plusOpen && (
              <span className="br-chat-menu br-chat-menu-plus">
                <button type="button" className="br-chat-menu-item book-pressable" onClick={quoteCurrent}>
                  引用这一段
                </button>
                <button type="button" className="br-chat-menu-item book-pressable" onClick={companionFeedback} disabled={sending}>
                  陪伴反馈
                </button>
              </span>
            )}
          </span>
          <textarea
            ref={textareaRef}
            className="br-chat-input"
            rows={1}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
            placeholder={kind === "manga" ? "和 TA 聊聊这一格……" : "和 TA 聊聊这一段……"}
            autoComplete="off"
            disabled={sending}
          />
          <button
            type="button"
            className="br-chat-send book-pressable"
            onClick={() => send(draft)}
            disabled={!draft.trim() || sending}
            aria-label="发送"
          >
            <ArrowUp size={16} strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <div className="br-chat-norole">
          <span>先选择一位 Float 角色，才能一起读。</span>
          <button type="button" className="br-chat-norole-btn book-pressable" onClick={onChooseRole}>
            去选择角色
          </button>
        </div>
      )}

      {hint && <div className="br-chat-hint" aria-live="polite">{hint}</div>}
    </>
  );

  /* Phase 9A：阅读页右侧滑出聊天室；Phase 9B-2：宽度 86~92%、独立背景、可右拖关闭 */
  if (variant === "drawer") {
    return (
      <div className="br-drawer-root" role="dialog" aria-label="共读聊天室">
        <button type="button" className="br-drawer-scrim" aria-label="关闭聊天" onClick={onClose} />
        <aside
          className={`br-drawer br-coread-drawer ${dragging ? "is-dragging" : ""}`}
          style={{ transform: `translateX(${dragX}px)` }}
        >
          {chatBody}
        </aside>
      </div>
    );
  }

  return (
    <BottomSheet
      title={kind === "manga" ? `一起看漫画 · ${book.title}` : `一起读 · ${book.title}`}
      onClose={onClose}
      panelClassName="br-sheet-chat"
    >
      {chatBody}
    </BottomSheet>
  );
}
