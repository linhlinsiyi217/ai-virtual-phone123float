"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Feather,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  createWritingProject,
  type CreateWritingProjectInput,
  type WritingOutlineItem,
  type WritingProject,
} from "@/lib/bookroom-writing";
import { quickstartWriting, WritingAiError } from "@/lib/bookroom-writing-context";
import { loadCharacters } from "@/lib/character-storage";
import { loadCharacterWorldGroups, type CharacterWorldGroup } from "@/lib/character-world-storage";
import { loadWorldBooks } from "@/lib/settings-storage";
import type { WorldBookConfig } from "@/lib/settings-types";
import { BottomSheet, BrToast } from "./bookroom-ui";

type Props = {
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

type Mode = "quick" | "advanced";

const GENRE_OPTIONS = ["小说", "短篇", "散文", "诗歌", "剧本", "随笔"];
const TONE_OPTIONS = ["清冷", "温柔", "克制", "高情绪浓度", "轻小说", "文艺", "日常", "悬疑", "电影感"];

export function WritingCreateSheet({ onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("quick");
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState<string[]>([]);
  const [tone, setTone] = useState<string[]>([]);
  const [pov, setPov] = useState("第三人称");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [userAsCharacter, setUserAsCharacter] = useState(false);
  const [worldArchiveId, setWorldArchiveId] = useState<string>("");
  const [lorebookIds, setLorebookIds] = useState<string[]>([]);
  const [includeMemory, setIncludeMemory] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const characters = loadCharacters();
  const worldGroups = loadCharacterWorldGroups();
  const worldBooks = loadWorldBooks();

  const flash = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  };

  const toggleGenre = (g: string) => {
    setGenre(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const toggleTone = (t: string) => {
    setTone(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const toggleRole = (id: string) => {
    setSelectedRoleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleLorebook = (id: string) => {
    setLorebookIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleQuickCreate = async () => {
    if (!idea.trim()) {
      flash("请先写一句你的故事灵感");
      return;
    }
    setCreating(true);
    try {
      const project = createWritingProject({
        title: title.trim() || "未命名作品",
        roleIds: selectedRoleIds,
        worldArchiveId: worldArchiveId || undefined,
        lorebookIds: lorebookIds.length ? lorebookIds : undefined,
        userAsCharacter,
        instructions: instructions.trim() || undefined,
        sourceContext: {
          includeUserProfile: userAsCharacter,
          includeRelationshipMemory: includeMemory,
          includeLongTermMemory: includeMemory,
          includeRecentMemory: includeMemory,
          includeWorldbook: true,
        },
      });
      const result = await quickstartWriting(project.id, idea.trim());
      // 更新项目：写入简介与大纲
      const { updateWritingProject } = await import("@/lib/bookroom-writing");
      updateWritingProject(project.id, {
        synopsis: result.synopsis,
        outline: result.outline,
      });
      flash("已生成简介与大纲");
      onCreated(project.id);
    } catch (error) {
      if (error instanceof WritingAiError) {
        flash(error.message);
      } else {
        flash("快速开始失败，请重试");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleAdvancedCreate = () => {
    if (!title.trim()) {
      flash("请输入作品名称");
      return;
    }
    const project = createWritingProject({
      title: title.trim(),
      genre: genre.length ? genre : undefined,
      tone: tone.length ? tone : undefined,
      pov,
      roleIds: selectedRoleIds,
      worldArchiveId: worldArchiveId || undefined,
      lorebookIds: lorebookIds.length ? lorebookIds : undefined,
      userAsCharacter,
      instructions: instructions.trim() || undefined,
      sourceContext: {
        includeUserProfile: userAsCharacter,
        includeRelationshipMemory: includeMemory,
        includeLongTermMemory: includeMemory,
        includeRecentMemory: includeMemory,
        includeWorldbook: true,
      },
    });
    flash("已创建作品");
    onCreated(project.id);
  };

  const renderQuick = () => (
    <div className="br-wizard-step">
      <p className="br-wizard-desc">用一句话描述你想写的故事，AI 会帮你生成简介、大纲和第一章建议。</p>
      <input
        type="text"
        className="br-input"
        placeholder="作品名称（可留空）"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        className="br-input br-input-area"
        placeholder="例如：写一个我和林栖在雨夜重逢的故事"
        rows={3}
        value={idea}
        onChange={e => setIdea(e.target.value)}
      />
      <button
        type="button"
        className="br-primary-btn book-pressable"
        onClick={handleQuickCreate}
        disabled={creating}
      >
        {creating ? "生成中…" : "开始创作"}
      </button>
    </div>
  );

  const renderAdvanced = () => {
    switch (step) {
      case 1:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第一步：作品名称</p>
            <input
              type="text"
              className="br-input"
              placeholder="作品名称"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
        );
      case 2:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第二步：类型与气质</p>
            <div className="br-chip-group">
              {GENRE_OPTIONS.map(g => (
                <button
                  key={g}
                  type="button"
                  className={`br-chip book-pressable ${genre.includes(g) ? "is-active" : ""}`}
                  onClick={() => toggleGenre(g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="br-chip-group" style={{ marginTop: 12 }}>
              {TONE_OPTIONS.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`br-chip book-pressable ${tone.includes(t) ? "is-active" : ""}`}
                  onClick={() => toggleTone(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第三步：选择角色（可多选）</p>
            <div className="br-wizard-role-list">
              {characters.length === 0 && <p className="br-wizard-empty">暂无角色</p>}
              {characters.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`br-wizard-role book-pressable ${selectedRoleIds.includes(c.id) ? "is-active" : ""}`}
                  onClick={() => toggleRole(c.id)}
                >
                  <span className="br-wizard-role-avatar">
                    {c.avatar ? <img src={c.avatar} alt="" /> : c.name.slice(0, 1)}
                  </span>
                  <span className="br-wizard-role-name">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第四步：是否把你写进故事</p>
            <button
              type="button"
              className={`br-wizard-option book-pressable ${userAsCharacter ? "is-active" : ""}`}
              onClick={() => setUserAsCharacter(!userAsCharacter)}
            >
              <span className="br-wizard-option-label">把我作为故事角色</span>
              <span className="br-wizard-option-desc">AI 将读取你的公开资料，把你自然地写进故事</span>
            </button>
          </div>
        );
      case 5:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第五步：世界设定</p>
            <p className="br-wizard-subdesc">世界卷宗（完整世界观容器）</p>
            <select
              className="br-input"
              value={worldArchiveId}
              onChange={e => setWorldArchiveId(e.target.value)}
            >
              <option value="">不使用</option>
              {worldGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <p className="br-wizard-subdesc" style={{ marginTop: 16 }}>世界书（知识条目）</p>
            <div className="br-wizard-role-list">
              {worldBooks.length === 0 && <p className="br-wizard-empty">暂无世界书</p>}
              {worldBooks.map(wb => (
                <button
                  key={wb.id}
                  type="button"
                  className={`br-wizard-role book-pressable ${lorebookIds.includes(wb.id) ? "is-active" : ""}`}
                  onClick={() => toggleLorebook(wb.id)}
                >
                  <span className="br-wizard-role-name">{wb.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case 6:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第六步：记忆与关系</p>
            <button
              type="button"
              className={`br-wizard-option book-pressable ${includeMemory ? "is-active" : ""}`}
              onClick={() => setIncludeMemory(!includeMemory)}
            >
              <span className="br-wizard-option-label">使用关系与记忆</span>
              <span className="br-wizard-option-desc">读取角色长期记忆、近期相处片段与共同经历</span>
            </button>
          </div>
        );
      case 7:
        return (
          <div className="br-wizard-step">
            <p className="br-wizard-desc">第七步：补充设定（可选）</p>
            <textarea
              className="br-input br-input-area"
              placeholder="其他写作要求、风格偏好、世界观补充等"
              rows={4}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <BottomSheet title="新建作品" onClose={onClose} panelClassName="br-wizard-sheet">
      <div className="br-wizard">
        <div className="br-wizard-mode">
          <button
            type="button"
            className={`br-wizard-mode-btn book-pressable ${mode === "quick" ? "is-active" : ""}`}
            onClick={() => setMode("quick")}
          >
            <Sparkles size={15} strokeWidth={2} />
            快速开始
          </button>
          <button
            type="button"
            className={`br-wizard-mode-btn book-pressable ${mode === "advanced" ? "is-active" : ""}`}
            onClick={() => setMode("advanced")}
          >
            <Feather size={15} strokeWidth={2} />
            高级设置
          </button>
        </div>

        {mode === "quick" ? renderQuick() : (
          <>
            <div className="br-wizard-progress">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className={`br-wizard-dot ${step === i + 1 ? "is-active" : ""} ${step > i + 1 ? "is-done" : ""}`} />
              ))}
            </div>
            {renderAdvanced()}
            <div className="br-wizard-actions">
              {step > 1 && (
                <button
                  type="button"
                  className="br-secondary-btn book-pressable"
                  onClick={() => setStep(s => s - 1)}
                >
                  <ChevronLeft size={16} strokeWidth={2} />
                  上一步
                </button>
              )}
              {step < 7 ? (
                <button
                  type="button"
                  className="br-primary-btn book-pressable"
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 1 && !title.trim()}
                >
                  下一步
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="button"
                  className="br-primary-btn book-pressable"
                  onClick={handleAdvancedCreate}
                >
                  <Plus size={16} strokeWidth={2} />
                  创建作品
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <BrToast text={hint} />
    </BottomSheet>
  );
}
