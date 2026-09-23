"use client";

import { useState } from "react";
import {
  ChevronRight,
  Feather,
  FolderOpen,
  Layers,
  PenLine,
  Sparkles,
  Users,
} from "lucide-react";
import { MOCK_DRAFTS } from "@/lib/bookroom-mock";
import { BrToast } from "./bookroom-ui";

const TOOLS = [
  { id: "ai", label: "AI 灵感", desc: "从一句话开始，让灵感接住你", icon: Sparkles },
  { id: "role", label: "角色写书", desc: "邀请角色卡与你一起执笔", icon: Users },
  { id: "chapter", label: "章节管理", desc: "梳理大纲与章节进度", icon: Layers },
  { id: "archive", label: "故事档案", desc: "人设、记忆与素材归档", icon: FolderOpen },
] as const;

/**
 * 书桌页：自己写书 / AI 灵感 / 角色写书 / 章节管理 / 故事档案。
 * 本轮只完成视觉壳层与本地草稿 mock，不接 AI 写作逻辑。
 */
export function WritingDeskView() {
  const [hint, setHint] = useState<string | null>(null);
  const flash = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  };

  return (
    <>
      <section className="book-section">
        <button
          type="button"
          className="br-write-hero book-glass book-pressable"
          onClick={() => flash("写作功能将在下一阶段开放")}
        >
          <span className="br-write-hero-icon" aria-hidden>
            <Feather size={22} strokeWidth={1.8} />
          </span>
          <span className="br-write-hero-main">
            <span className="br-write-hero-title">开始新的写作</span>
            <span className="br-write-hero-desc">人设 × 记忆 × AI，陪你把故事慢慢写完</span>
          </span>
          <ChevronRight size={18} strokeWidth={2} className="br-write-hero-arrow" />
        </button>
      </section>

      <section className="book-section">
        <h2 className="book-section-title">写作工具</h2>
        <div className="br-list book-glass">
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className="br-list-row book-pressable"
                onClick={() => flash(`${tool.label}将在下一阶段接入`)}
              >
                <span className="br-list-icon" aria-hidden>
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="br-list-main">
                  <span className="br-list-label">{tool.label}</span>
                  <span className="br-list-desc">{tool.desc}</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="br-list-arrow" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">草稿与档案</h2>
          <span className="book-section-more">{MOCK_DRAFTS.length} 篇</span>
        </div>
        <div className="br-draft-list">
          {MOCK_DRAFTS.map(draft => (
            <button
              key={draft.id}
              type="button"
              className="br-draft book-glass book-pressable"
              onClick={() => flash("章节编辑器将在下一阶段开放")}
            >
              <span className="br-draft-head">
                <span className="br-draft-title">{draft.title}</span>
                <span className="br-draft-kind">{draft.kind}</span>
              </span>
              <span className="br-draft-excerpt">{draft.excerpt}</span>
              <span className="br-draft-meta">
                <PenLine size={11} strokeWidth={2} />
                {draft.words.toLocaleString()} 字 · {draft.updated}
              </span>
            </button>
          ))}
        </div>
      </section>

      <footer className="book-footer">BOOKROOM · DESK</footer>
      <BrToast text={hint} />
    </>
  );
}
