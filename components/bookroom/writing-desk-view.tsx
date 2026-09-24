"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Feather,
  FolderOpen,
  Layers,
  PenLine,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { listWritingProjects, type WritingProject } from "@/lib/bookroom-writing";
import { BrToast } from "./bookroom-ui";

const TOOLS = [
  { id: "ai", label: "AI 灵感", desc: "从一句话开始，让灵感接住你", icon: Sparkles },
  { id: "role", label: "角色写书", desc: "邀请角色卡与你一起执笔", icon: Users },
  { id: "chapter", label: "章节管理", desc: "梳理大纲与章节进度", icon: Layers },
  { id: "archive", label: "故事档案", desc: "人设、记忆与素材归档", icon: FolderOpen },
] as const;

type Props = {
  onOpenProject: (projectId: string) => void;
};

/**
 * 书桌首页：新建作品 / 最近作品 / 草稿 / 已完成。
 * Phase 6A：接入真实 WritingProject 数据，替换 mock 草稿。
 */
export function WritingDeskView({ onOpenProject }: Props) {
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setProjects(listWritingProjects());
  }, []);

  const flash = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  };

  const drafts = projects.filter(p => p.status === "draft");
  const writing = projects.filter(p => p.status === "writing");
  const finished = projects.filter(p => p.status === "finished");
  const recent = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);

  return (
    <>
      <section className="book-section">
        <button
          type="button"
          className="br-write-hero book-glass book-pressable"
          onClick={() => onOpenProject("new")}
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
                onClick={() => flash(`${tool.label}将在后续阶段接入`)}
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

      {recent.length > 0 && (
        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">最近作品</h2>
            <span className="book-section-more">{projects.length} 部</span>
          </div>
          <div className="br-draft-list">
            {recent.map(project => (
              <button
                key={project.id}
                type="button"
                className="br-draft book-glass book-pressable"
                onClick={() => onOpenProject(project.id)}
              >
                <span className="br-draft-head">
                  <span className="br-draft-title">{project.title}</span>
                  <span className={`br-draft-kind is-${project.status}`}>
                    {project.status === "draft" ? "草稿" : project.status === "writing" ? "写作中" : "已完成"}
                  </span>
                </span>
                <span className="br-draft-excerpt">
                  {project.synopsis || "暂无简介"}
                </span>
                <span className="br-draft-meta">
                  <PenLine size={11} strokeWidth={2} />
                  {project.chapters.length} 章 · 更新于 {new Date(project.updatedAt).toLocaleDateString("zh-CN")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length === 0 && (
        <section className="book-section">
          <div className="br-writing-empty book-glass">
            <Feather size={28} strokeWidth={1.6} />
            <p>还没有作品</p>
            <p className="br-writing-empty-desc">从一句话开始，创建你的第一部 AI 写作工程</p>
            <button
              type="button"
              className="br-writing-empty-btn book-pressable"
              onClick={() => onOpenProject("new")}
            >
              <Plus size={16} strokeWidth={2} />
              新建作品
            </button>
          </div>
        </section>
      )}

      <footer className="book-footer">BOOKROOM · DESK</footer>
      <BrToast text={hint} />
    </>
  );
}
