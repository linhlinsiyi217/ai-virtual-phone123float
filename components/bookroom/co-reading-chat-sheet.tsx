"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, MessageCircleHeart, Quote, Send, Sparkles, X } from "lucide-react";
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
 * 共读 / 共看半弹层（Phase 3A 接入真实 AI，Phase 5B 接入共读会话记录）。
 * - 角色显示实时解析 canonical 角色卡：改名 / 换头像后自动反映最新；
 * - 打开（真实角色）即开始 / 继续 CoReadingSession，关闭即暂停；
 * - 会话历史走 kv-db（短期），值得保留的事件才写长期记忆（带 sessionId 关联）；
 * - 仅在用户主动发送 / 问 TA / 陪伴反馈时请求 AI，不做每页自动发言。
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

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const initialAskFiredRef = useRef(false);

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
    send(kind === "manga"
      ? "你怎么看现在这一格分镜？想听听你的感受。"
      : "你怎么看现在这一段？想听听你的感受。");
  };

  const companionFeedback = () => {
    if (sending) return;
    send("我想听听你此刻陪我读的心情。");
  };

  /* Phase 9A：快捷提问 chips —— 点击即以用户身份发出预制问题 */
  const quickAsk = (preset: "meaning" | "summary" | "why" | "predict" | "voice") => {
    if (sending) return;
    const excerpt = (contentRef.currentExcerpt || contentRef.pageCaption || "").slice(0, 160);
    switch (preset) {
      case "meaning":
        send(excerpt
          ? `这一段我读得不太明白：「${excerpt}」\n你能帮我解释一下吗？`
          : "这一段我读得不太明白，你能帮我解释一下吗？");
        break;
      case "summary":
        send("帮我轻轻总结一下我们目前读到的内容吧。");
        break;
      case "why":
        send("你觉得故事里的他为什么这样做？聊聊你的理解。");
        break;
      case "predict":
        send("猜猜接下来可能会发生什么？只用我们已经读到的内容，不要剧透后面。");
        break;
      case "voice":
        send("用你自己的口吻，跟我说一句此刻最想说的话。");
        break;
    }
  };

  /* 引用当前段落进输入框（不自动发送） */
  const quoteCurrent = () => {
    const excerpt = (contentRef.currentExcerpt || contentRef.pageCaption || "").slice(0, 120);
    if (!excerpt) {
      flashHint("当前位置暂无可引用的段落");
      return;
    }
    setDraft(draft => `「${excerpt}」${draft}`);
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

  const chatBody = (
    <>
      <div className="br-chat-head">
        <span className="br-chat-avatar">
          {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
        </span>
        <span className="br-chat-who">
          <span className="br-chat-name">{display.name}</span>
          <span className="br-chat-sub">{display.subtitle}</span>
        </span>
        <span className="br-chat-state">
          <span className={`br-role-dot ${sending ? "br-role-dot-online" : "br-role-dot-reading"}`} />
          {sending ? "回复中" : "共读中"}
        </span>
        {variant === "drawer" && (
          <button
            type="button"
            className="book-icon-btn book-pressable br-chat-close"
            onClick={onClose}
            aria-label="关闭聊天"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="br-chat-list" ref={listRef}>
        {messages.map(message => {
          if (message.role === "system") {
            return <p key={message.id} className="br-chat-system">{message.content}</p>;
          }
          const mine = message.role === "user";
          return (
            <div key={message.id} className={`br-chat-row ${mine ? "is-mine" : ""}`}>
              {!mine && (
                <span className="br-chat-bubble-avatar">
                  {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
                </span>
              )}
              <span className="br-chat-bubble">{message.content}</span>
            </div>
          );
        })}

        {sending && (
          <div className="br-chat-row">
            <span className="br-chat-bubble-avatar">
              {display.avatar ? <img src={display.avatar} alt="" /> : display.name.slice(0, 1)}
            </span>
            <span className="br-chat-bubble br-chat-bubble-typing" aria-label="对方正在输入">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}

        {error && (
          <div className="br-chat-row">
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

      <div className="br-chat-actions">
        <button
          type="button"
          className="br-chat-action book-pressable"
          onClick={askRole}
          disabled={sending || !roleReady}
        >
          <Sparkles size={13} strokeWidth={2} />
          问 TA
        </button>
        <button
          type="button"
          className="br-chat-action book-pressable"
          onClick={() => flashHint("已为这一段轻轻记下批注")}
        >
          <Bookmark size={13} strokeWidth={2} />
          批注
        </button>
        <button
          type="button"
          className="br-chat-action book-pressable"
          onClick={companionFeedback}
          disabled={sending || !roleReady}
        >
          <MessageCircleHeart size={13} strokeWidth={2} />
          陪伴反馈
        </button>
      </div>

      {roleReady && (
        <div className="br-chat-quick" role="group" aria-label="快捷提问">
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("meaning")} disabled={sending}>这段什么意思</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("summary")} disabled={sending}>帮我总结</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("why")} disabled={sending}>他为什么这样</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("predict")} disabled={sending}>猜后续</button>
          <button type="button" className="br-chat-quick-chip book-pressable" onClick={() => quickAsk("voice")} disabled={sending}>以角色口吻回复</button>
        </div>
      )}

      {roleReady ? (
        <div className="br-chat-inputbar">
          <button
            type="button"
            className="br-chat-quote-btn book-pressable"
            onClick={quoteCurrent}
            aria-label="引用当前段落"
            title="引用当前段落"
          >
            <Quote size={15} strokeWidth={2} />
          </button>
          <input
            type="text"
            className="br-chat-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") send(draft);
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
            <Send size={15} strokeWidth={2} />
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

  /* Phase 9A：阅读页右侧滑出聊天室（复用 br-drawer 骨架，与角色侧栏一致） */
  if (variant === "drawer") {
    return (
      <div className="br-drawer-root" role="dialog" aria-label="共读聊天室">
        <button type="button" className="br-drawer-scrim" aria-label="关闭聊天" onClick={onClose} />
        <aside className="br-drawer br-coread-drawer">
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
