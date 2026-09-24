"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Feather,
  FileText,
  History,
  Lightbulb,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import {
  getWritingProject,
  loadChapterDoc,
  saveChapterContent,
  addWritingChapter,
  updateWritingProject,
  updateWritingChapterMeta,
  deleteWritingChapter,
  reorderWritingChapters,
  restoreChapterVersion,
  addWritingMaterial,
  removeWritingMaterial,
  publishProjectAsBook,
  deleteWritingChapter as _deleteChapter,
  type WritingProject,
  type WritingChapterMeta,
  type WritingOutlineItem,
  type WritingChapterVersion,
} from "@/lib/bookroom-writing";
import {
  generateWriting,
  WritingAiError,
  type WritingAction,
} from "@/lib/bookroom-writing-context";
import { addToShelf } from "@/lib/bookroom-shelf";
import { Segmented, BottomSheet, BrToast } from "./bookroom-ui";

type Props = {
  projectId: string;
  onBack: () => void;
};

type Tab = "editor" | "outline" | "settings";
type SaveState = "idle" | "saving" | "saved";

const TABS: { value: Tab; label: string }[] = [
  { value: "editor", label: "写作" },
  { value: "outline", label: "大纲" },
  { value: "settings", label: "设定" },
];

const AI_ACTIONS: { action: WritingAction; label: string; icon: typeof Sparkles }[] = [
  { action: "write", label: "写这一章", icon: Feather },
  { action: "continue", label: "继续写", icon: Sparkles },
  { action: "expand", label: "扩写", icon: Type },
  { action: "condense", label: "缩写", icon: ChevronDown },
  { action: "rewrite", label: "改写", icon: RotateCcw },
  { action: "polish", label: "润色", icon: Wand2 },
  { action: "detail", label: "补细节", icon: Lightbulb },
  { action: "dialogue", label: "生成对话", icon: Type },
  { action: "environment", label: "环境描写", icon: Type },
  { action: "summary", label: "总结本章", icon: FileText },
];

export function WritingProjectView({ projectId, onBack }: Props) {
  const [project, setProject] = useState<WritingProject | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("editor");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [versionSheetOpen, setVersionSheetOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineText, setOutlineText] = useState("");
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flash = useCallback((text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  }, []);

  // 加载项目
  useEffect(() => {
    const p = getWritingProject(projectId);
    if (!p) return;
    setProject(p);
    const chapterId = p.lastChapterId ?? p.chapters[0]?.id ?? null;
    setActiveChapterId(chapterId);
    if (chapterId) {
      const doc = loadChapterDoc(projectId, chapterId);
      setContent(doc.content);
    }
  }, [projectId]);

  // 自动保存 debounce 800ms
  useEffect(() => {
    if (!project || !activeChapterId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      saveChapterContent(projectId, activeChapterId, content);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, activeChapterId, projectId, project]);

  // 切离 / pagehide 时 flush
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (project && activeChapterId) {
        saveChapterContent(projectId, activeChapterId, content);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [project, activeChapterId, content, projectId]);

  const switchChapter = (chapterId: string) => {
    // flush 当前
    if (activeChapterId && project) {
      saveChapterContent(projectId, activeChapterId, content);
    }
    setActiveChapterId(chapterId);
    const doc = loadChapterDoc(projectId, chapterId);
    setContent(doc.content);
    setAiPreview(null);
  };

  const handleAddChapter = () => {
    const meta = addWritingChapter(projectId);
    if (!meta) return;
    setProject(getWritingProject(projectId));
    switchChapter(meta.id);
    flash("已新建章节");
  };

  const handleDeleteChapter = (chapterId: string) => {
    if (!project) return;
    deleteWritingChapter(projectId, chapterId);
    setProject(getWritingProject(projectId));
    if (activeChapterId === chapterId) {
      const next = project.chapters.find(c => c.id !== chapterId);
      if (next) switchChapter(next.id);
      else {
        setActiveChapterId(null);
        setContent("");
      }
    }
    flash("已删除章节");
  };

  const handleGenerate = async (action: WritingAction) => {
    if (!project || !activeChapterId) return;
    setAiLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await generateWriting({
        projectId,
        chapterId: activeChapterId,
        action,
        signal: ctrl.signal,
      });
      setAiPreview(result.text);
    } catch (error) {
      if (error instanceof WritingAiError) {
        flash(error.message);
      } else {
        flash("生成失败，请重试");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateSelection = async (action: WritingAction) => {
    if (!project || !activeChapterId || !selectionMenu) return;
    setAiLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await generateWriting({
        projectId,
        chapterId: activeChapterId,
        action,
        instruction: selectionMenu.text,
        signal: ctrl.signal,
      });
      setAiPreview(result.text);
    } catch (error) {
      if (error instanceof WritingAiError) {
        flash(error.message);
      } else {
        flash("生成失败，请重试");
      }
    } finally {
      setAiLoading(false);
      setSelectionMenu(null);
    }
  };

  const insertText = (text: string, mode: "insert-cursor" | "replace-selection" | "append" | "preview") => {
    const editor = editorRef.current;
    if (!editor) return;
    if (mode === "preview") return;
    if (mode === "append") {
      setContent(prev => prev + "\n\n" + text);
      flash("已追加到末尾");
    } else if (mode === "replace-selection" && editor.selectionStart !== editor.selectionEnd) {
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      setContent(prev => prev.slice(0, start) + text + prev.slice(end));
      flash("已替换选区");
    } else {
      const pos = editor.selectionStart;
      setContent(prev => prev.slice(0, pos) + text + prev.slice(pos));
      flash("已插入");
    }
    setAiPreview(null);
  };

  const handleRestoreVersion = (index: number) => {
    if (!activeChapterId) return;
    const restored = restoreChapterVersion(projectId, activeChapterId, index);
    if (restored !== null) {
      setContent(restored);
      flash("已恢复版本");
    }
    setVersionSheetOpen(false);
  };

  const handleExport = (format: "txt" | "md") => {
    if (!project) return;
    const lines: string[] = [];
    lines.push(`# ${project.title}`);
    if (project.subtitle) lines.push(`> ${project.subtitle}`);
    if (project.synopsis) lines.push("\n" + project.synopsis + "\n");
    const sorted = [...project.chapters].sort((a, b) => a.order - b.order);
    for (const meta of sorted) {
      lines.push(`\n## ${meta.title}\n`);
      const doc = loadChapterDoc(projectId, meta.id);
      lines.push(doc.content);
    }
    const full = lines.join("\n");
    const blob = new Blob([full], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportSheetOpen(false);
    flash(`已导出 ${format.toUpperCase()}`);
  };

  const handleFinish = () => {
    if (!project) return;
    updateWritingProject(projectId, { status: "finished" });
    setProject(getWritingProject(projectId));
    setFinishConfirmOpen(false);
    flash("作品已标记为完成");
  };

  const handlePublish = () => {
    if (!project) return;
    const book = publishProjectAsBook(projectId);
    if (book) {
      addToShelf(book.id, "generated");
      flash("已加入书架");
    } else {
      flash("发布失败：没有可发布的内容");
    }
  };

  const handleSaveOutline = () => {
    if (!project) return;
    const items: WritingOutlineItem[] = [];
    for (const line of outlineText.trim().split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const cleaned = trimmed.replace(/^[-\d.\s]+/, "");
      const parts = cleaned.split(/[｜|]/);
      const title = parts[0]?.trim();
      const summary = parts[1]?.trim();
      if (title) {
        items.push({
          id: `outline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${items.length}`,
          title,
          summary,
        });
      }
    }
    updateWritingProject(projectId, { outline: items });
    setProject(getWritingProject(projectId));
    setEditingOutline(false);
    flash("大纲已保存");
  };

  const handleAddMaterial = (text: string) => {
    addWritingMaterial(projectId, text);
    setProject(getWritingProject(projectId));
  };

  const activeChapter = project?.chapters.find(c => c.id === activeChapterId) ?? null;
  const versions = activeChapterId ? loadChapterDoc(projectId, activeChapterId).versions : [];

  // 划词菜单
  const handleTextSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSelectionMenu(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 2) {
      setSelectionMenu(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelectionMenu({
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 140),
      y: Math.max(rect.top - 44, 8),
      text,
    });
  };

  if (!project) {
    return (
      <div className="br-page">
        <div className="br-loading">加载中…</div>
      </div>
    );
  }

  return (
    <div className="br-page">
      <header className="book-header br-header">
        <div className="book-appbar">
          <button type="button" className="book-icon-btn book-pressable" onClick={onBack} aria-label="返回">
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="book-title-stack">
          <h1 className="book-title">{project.title}</h1>
          <p className="book-subtitle">{project.synopsis || "写作中"}</p>
        </div>
      </header>

      <div className="br-project-toolbar">
        <Segmented
          options={TABS.map(t => ({ value: t.value, label: t.label }))}
          value={activeTab}
          onChange={v => setActiveTab(v as Tab)}
          ariaLabel="工作台标签"
        />
        <div className="br-project-save-state">
          {saveState === "saving" && <><Save size={12} strokeWidth={2} /> 保存中</>}
          {saveState === "saved" && <><Clock size={12} strokeWidth={2} /> 已保存</>}
        </div>
      </div>

      <div className="book-body br-body br-project-body">
        {activeTab === "editor" && (
          <>
            <div className="br-chapter-bar">
              <div className="br-chapter-list">
                {project.chapters.map(meta => (
                  <button
                    key={meta.id}
                    type="button"
                    className={`br-chapter-tab book-pressable ${meta.id === activeChapterId ? "is-active" : ""}`}
                    onClick={() => switchChapter(meta.id)}
                  >
                    {meta.title}
                    {meta.status === "finished" && <span className="br-chapter-done" />}
                  </button>
                ))}
                <button
                  type="button"
                  className="br-chapter-tab book-pressable br-chapter-add"
                  onClick={handleAddChapter}
                  aria-label="新建章节"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
              <div className="br-chapter-actions">
                <button
                  type="button"
                  className="book-icon-btn book-pressable"
                  onClick={() => setVersionSheetOpen(true)}
                  title="版本历史"
                >
                  <History size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="book-icon-btn book-pressable"
                  onClick={() => setExportSheetOpen(true)}
                  title="导出"
                >
                  <Download size={15} strokeWidth={2} />
                </button>
                {activeChapter && (
                  <button
                    type="button"
                    className="book-icon-btn book-pressable"
                    onClick={() => handleDeleteChapter(activeChapter.id)}
                    title="删除章节"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            {activeChapter && (
              <>
                <input
                  type="text"
                  className="br-chapter-title-input"
                  value={activeChapter.title}
                  onChange={e => {
                    updateWritingChapterMeta(projectId, activeChapter.id, { title: e.target.value });
                    setProject(getWritingProject(projectId));
                  }}
                  placeholder="章节标题"
                />
                <div className="br-editor-wrap">
                  <textarea
                    ref={editorRef}
                    className="br-editor"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onMouseUp={handleTextSelect}
                    onKeyUp={handleTextSelect}
                    placeholder="从这里开始写……"
                  />
                  {selectionMenu && (
                    <div
                      className="br-selection-menu"
                      style={{ left: selectionMenu.x, top: selectionMenu.y }}
                    >
                      <div className="br-selection-row">
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("rewrite")}>改写</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("expand")}>扩写</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("condense")}>缩写</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("polish")}>润色</button>
                      </div>
                      <div className="br-selection-row">
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("tone")}>更自然</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("detail")}>更有张力</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("continue")}>生成后续</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="br-ai-toolbar">
                  <span className="br-ai-toolbar-label">AI 写作</span>
                  {AI_ACTIONS.map(a => (
                    <button
                      key={a.action}
                      type="button"
                      className="br-ai-action book-pressable"
                      onClick={() => handleGenerate(a.action)}
                      disabled={aiLoading}
                    >
                      <a.icon size={13} strokeWidth={2} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!activeChapter && (
              <div className="br-editor-empty">
                <Feather size={28} strokeWidth={1.6} />
                <p>还没有章节</p>
                <button type="button" className="br-primary-btn book-pressable" onClick={handleAddChapter}>
                  <Plus size={16} strokeWidth={2} />
                  新建章节
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === "outline" && (
          <div className="br-outline-panel">
            <div className="br-outline-header">
              <h3>大纲</h3>
              <button
                type="button"
                className="book-icon-btn book-pressable"
                onClick={() => {
                  setOutlineText(
                    project.outline
                      .map(o => `${o.title}${o.summary ? "｜" + o.summary : ""}`)
                      .join("\n")
                  );
                  setEditingOutline(!editingOutline);
                }}
              >
                {editingOutline ? <X size={15} strokeWidth={2} /> : <Wand2 size={15} strokeWidth={2} />}
              </button>
            </div>
            {editingOutline ? (
              <div className="br-outline-edit">
                <textarea
                  className="br-input br-input-area"
                  rows={12}
                  value={outlineText}
                  onChange={e => setOutlineText(e.target.value)}
                  placeholder="每行一个章节：章节标题｜一句话概要"
                />
                <button type="button" className="br-primary-btn book-pressable" onClick={handleSaveOutline}>
                  保存大纲
                </button>
              </div>
            ) : (
              <div className="br-outline-list">
                {project.outline.length === 0 && <p className="br-outline-empty">暂无大纲</p>}
                {project.outline.map((item, index) => (
                  <div key={item.id} className="br-outline-item">
                    <span className="br-outline-num">{index + 1}</span>
                    <span className="br-outline-title">{item.title}</span>
                    {item.summary && <span className="br-outline-summary">{item.summary}</span>}
                    {item.done && <span className="br-outline-done">已完成</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="br-settings-panel">
            <div className="br-settings-group">
              <h4>作品信息</h4>
              <div className="br-settings-row">
                <label>名称</label>
                <input
                  type="text"
                  className="br-input"
                  value={project.title}
                  onChange={e => {
                    updateWritingProject(projectId, { title: e.target.value });
                    setProject(getWritingProject(projectId));
                  }}
                />
              </div>
              {project.subtitle !== undefined && (
                <div className="br-settings-row">
                  <label>副标题</label>
                  <input
                    type="text"
                    className="br-input"
                    value={project.subtitle || ""}
                    onChange={e => {
                      updateWritingProject(projectId, { subtitle: e.target.value || undefined });
                      setProject(getWritingProject(projectId));
                    }}
                  />
                </div>
              )}
              <div className="br-settings-row">
                <label>简介</label>
                <textarea
                  className="br-input br-input-area"
                  rows={4}
                  value={project.synopsis || ""}
                  onChange={e => {
                    updateWritingProject(projectId, { synopsis: e.target.value || undefined });
                    setProject(getWritingProject(projectId));
                  }}
                />
              </div>
              <div className="br-settings-row">
                <label>写作要求</label>
                <textarea
                  className="br-input br-input-area"
                  rows={4}
                  value={project.instructions || ""}
                  onChange={e => {
                    updateWritingProject(projectId, { instructions: e.target.value || undefined });
                    setProject(getWritingProject(projectId));
                  }}
                />
              </div>
            </div>

            <div className="br-settings-group">
              <h4>故事素材 / 共同经历</h4>
              <div className="br-material-list">
                {project.materials.map(m => (
                  <div key={m.id} className="br-material-item">
                    <span className="br-material-text">{m.text}</span>
                    <button
                      type="button"
                      className="book-icon-btn book-pressable"
                      onClick={() => {
                        removeWritingMaterial(projectId, m.id);
                        setProject(getWritingProject(projectId));
                      }}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="br-material-add book-pressable"
                  onClick={() => {
                    const text = window.prompt("添加故事素材");
                    if (text) {
                      handleAddMaterial(text);
                      flash("已添加素材");
                    }
                  }}
                >
                  <Plus size={14} strokeWidth={2} /> 添加素材
                </button>
              </div>
            </div>

            <div className="br-settings-group">
              <h4>完成与发布</h4>
              {project.status !== "finished" ? (
                <button
                  type="button"
                  className="br-primary-btn book-pressable"
                  onClick={() => setFinishConfirmOpen(true)}
                >
                  <Wand2 size={15} strokeWidth={2} />
                  标记为完成
                </button>
              ) : (
                <button
                  type="button"
                  className="br-primary-btn book-pressable"
                  onClick={handlePublish}
                >
                  <Download size={15} strokeWidth={2} />
                  加入书架
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI 结果预览 Sheet */}
      {aiPreview !== null && (
        <BottomSheet title="AI 生成结果" onClose={() => setAiPreview(null)} panelClassName="br-preview-sheet">
          <div className="br-preview-body">
            <textarea
              className="br-preview-text"
              rows={12}
              value={aiPreview}
              onChange={e => setAiPreview(e.target.value)}
            />
            <div className="br-preview-actions">
              <button
                type="button"
                className="br-secondary-btn book-pressable"
                onClick={() => setAiPreview(null)}
              >
                放弃
              </button>
              <button
                type="button"
                className="br-secondary-btn book-pressable"
                onClick={() => insertText(aiPreview, "insert-cursor")}
              >
                插入光标处
              </button>
              <button
                type="button"
                className="br-secondary-btn book-pressable"
                onClick={() => insertText(aiPreview, "replace-selection")}
              >
                替换选区
              </button>
              <button
                type="button"
                className="br-primary-btn book-pressable"
                onClick={() => insertText(aiPreview, "append")}
              >
                放到末尾
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* 版本历史 Sheet */}
      {versionSheetOpen && (
        <BottomSheet title="版本历史" onClose={() => setVersionSheetOpen(false)}>
          <div className="br-version-list">
            {versions.length === 0 && <p className="br-version-empty">暂无历史版本</p>}
            {versions.map((v, i) => (
              <div key={i} className="br-version-item">
                <span className="br-version-label">{v.label || `版本 ${i + 1}`}</span>
                <span className="br-version-time">{new Date(v.savedAt).toLocaleString("zh-CN")}</span>
                <button
                  type="button"
                  className="br-version-restore book-pressable"
                  onClick={() => handleRestoreVersion(i)}
                >
                  <Undo2 size={14} strokeWidth={2} />
                  恢复
                </button>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* 导出 Sheet */}
      {exportSheetOpen && (
        <BottomSheet title="导出作品" onClose={() => setExportSheetOpen(false)}>
          <div className="br-export-list">
            <button type="button" className="br-export-btn book-pressable" onClick={() => handleExport("txt")}>
              <FileText size={18} strokeWidth={2} />
              导出为 TXT
            </button>
            <button type="button" className="br-export-btn book-pressable" onClick={() => handleExport("md")}>
              <FileText size={18} strokeWidth={2} />
              导出为 Markdown
            </button>
          </div>
        </BottomSheet>
      )}

      {/* 完成确认 */}
      {finishConfirmOpen && (
        <div className="br-sheet-root" role="dialog" aria-modal="true">
          <button type="button" className="br-sheet-scrim" onClick={() => setFinishConfirmOpen(false)} aria-label="关闭" tabIndex={-1} />
          <section className="br-sheet">
            <div className="br-sheet-grabber" aria-hidden />
            <header className="br-sheet-head">
              <h3 className="br-sheet-title">确认完成</h3>
              <button type="button" className="book-icon-btn book-pressable br-sheet-close" onClick={() => setFinishConfirmOpen(false)} aria-label="关闭">
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            <div className="br-sheet-body">
              <p>标记为完成后，可将其加入书架。是否继续？</p>
              <div className="br-preview-actions">
                <button type="button" className="br-secondary-btn book-pressable" onClick={() => setFinishConfirmOpen(false)}>取消</button>
                <button type="button" className="br-primary-btn book-pressable" onClick={handleFinish}>确认完成</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <BrToast text={hint} />
    </div>
  );
}
