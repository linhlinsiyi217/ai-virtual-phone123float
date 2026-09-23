"use client";

import { useRef, useState } from "react";
import { Bookmark, MessageCircleHeart, Send, Sparkles } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import type { CompanionRole } from "@/lib/bookroom-mock";
import { BottomSheet } from "./bookroom-ui";

type Props = {
  book: Book;
  role: CompanionRole;
  /** book=「一起读」；manga=「一起看漫画」 */
  kind: "book" | "manga";
  onClose: () => void;
};

type ChatMessage = {
  id: number;
  from: "role" | "me" | "system";
  text: string;
};

const READ_ACTION = "读到想停下来的句子，就发给我。";

function buildSeed(book: Book, roleName: string, kind: "book" | "manga"): ChatMessage[] {
  if (kind === "manga") {
    return [
      { id: 1, from: "role", text: `我在。我们一起看《${book.title}》，这一格的分镜我也很喜欢。` },
      { id: 2, from: "me", text: "这里人物的表情变化好细腻。" },
      { id: 3, from: "role", text: "嗯，作者把没有说出口的话都画在停顿里了。慢慢翻，我陪你。" },
    ];
  }
  return [
    { id: 1, from: "role", text: `今晚我们一起读《${book.title}》吧，我是${roleName}。` },
    { id: 2, from: "me", text: "好，我刚翻开第一章。" },
    { id: 3, from: "role", text: READ_ACTION },
  ];
}

const ROLE_REPLIES = [
  "这一句我也停下来了，像有人轻轻把灯调暗了一点。",
  "我在听，你慢慢说，不用着急。",
  "要不要把它收进语录？以后夜读的时候，我再念给你听。",
  "读到这里会想起谁，也是书送给你的一部分。",
];

/**
 * 共读 / 共看半弹层：高级灰白气泡 + 当前陪读角色 + 问 TA / 批注 / 陪伴反馈。
 * 纯本地 mock 对话，不接真实 AI。
 */
export function CoReadingChatSheet({ book, role, kind, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => buildSeed(book, role.name, kind));
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(100);
  const timerRef = useRef<number | null>(null);

  const pushMessage = (message: Omit<ChatMessage, "id">) => {
    seqRef.current += 1;
    setMessages(prev => [...prev, { ...message, id: seqRef.current }]);
    window.requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content) return;
    pushMessage({ from: "me", text: content });
    setDraft("");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      pushMessage({ from: "role", text: ROLE_REPLIES[Math.floor(Math.random() * ROLE_REPLIES.length)] });
    }, 650);
  };

  const flashHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1600);
  };

  const askRole = () => {
    pushMessage({ from: "role", text: kind === "manga" ? "这一格想聊什么？分镜、情绪，或者角色，我都在。" : READ_ACTION });
  };

  return (
    <BottomSheet
      title={kind === "manga" ? `一起看漫画 · ${book.title}` : `一起读 · ${book.title}`}
      onClose={onClose}
      panelClassName="br-sheet-chat"
    >
      <div className="br-chat-head">
        <span className="br-chat-avatar">
          {role.avatar ? <img src={role.avatar} alt="" /> : role.name.slice(0, 1)}
        </span>
        <span className="br-chat-who">
          <span className="br-chat-name">{role.name}</span>
          <span className="br-chat-sub">{role.subtitle}</span>
        </span>
        <span className="br-chat-state">
          <span className="br-role-dot br-role-dot-reading" />
          共读中
        </span>
      </div>

      <div className="br-chat-list" ref={listRef}>
        {messages.map(message => {
          if (message.from === "system") {
            return (
              <p key={message.id} className="br-chat-system">{message.text}</p>
            );
          }
          const mine = message.from === "me";
          return (
            <div key={message.id} className={`br-chat-row ${mine ? "is-mine" : ""}`}>
              {!mine && (
                <span className="br-chat-bubble-avatar">
                  {role.avatar ? <img src={role.avatar} alt="" /> : role.name.slice(0, 1)}
                </span>
              )}
              <span className="br-chat-bubble">{message.text}</span>
            </div>
          );
        })}
      </div>

      <div className="br-chat-actions">
        <button type="button" className="br-chat-action book-pressable" onClick={askRole}>
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
          onClick={() => flashHint("谢谢你的反馈，TA 会记得这一刻")}
        >
          <MessageCircleHeart size={13} strokeWidth={2} />
          陪伴反馈
        </button>
      </div>

      <div className="br-chat-inputbar">
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
        />
        <button
          type="button"
          className="br-chat-send book-pressable"
          onClick={() => send(draft)}
          disabled={!draft.trim()}
          aria-label="发送"
        >
          <Send size={15} strokeWidth={2} />
        </button>
      </div>

      {hint && <div className="br-chat-hint" aria-live="polite">{hint}</div>}
    </BottomSheet>
  );
}
