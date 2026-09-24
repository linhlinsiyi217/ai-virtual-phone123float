"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Feather,
  FileText,
  History,
  Layers,
  Lightbulb,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
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
  restoreChapterVersion,
  addWritingMaterial,
  updateWritingMaterial,
  removeWritingMaterial,
  publishProjectAsBook,
  duplicateWritingChapter,
  moveWritingChapter,
  snapshotChapterVersion,
  getWritingTotalWords,
  WRITING_MATERIAL_TYPE_LABELS,
  type WritingProject,
  type WritingChapterStatus,
  type WritingMaterial,
  type WritingMaterialType,
} from "@/lib/bookroom-writing";
import {
  generateWriting,
  WritingAiError,
  type WritingAction,
} from "@/lib/bookroom-writing-context";
import { addToShelf, getShelfEntry } from "@/lib/bookroom-shelf";
import { Segmented, BottomSheet, BrToast } from "./bookroom-ui";

type Props = {
  projectId: string;
  onBack: () => void;
};

type Tab = "editor" | "outline" | "material" | "settings";
type SaveState = "idle" | "saving" | "saved";

const TABS: { value: Tab; label: string }[] = [
  { value: "editor", label: "写作" },
  { value: "outline", label: "大纲" },
  { value: "material", label: "素材" },
  { value: "settings", label: "设定" },
];

const AI_ACTIONS: { action: WritingAction; label: string; icon: typeof Feather }[] = [
  { action: "write", label: "写这一章", icon: Feather },
  { action: "continue", label: "继续写", icon: Wand2 },
  { action: "expand", label: "扩写", icon: Type },
  { action: "condense", label: "缩写", icon: ChevronDown },
  { action: "rewrite", label: "改写", icon: RotateCcw },
  { action: "polish", label: "润色", icon: Wand2 },
  { action: "detail", label: "补细节", icon: Lightbulb },
  { action: "dialogue", label: "生成对话", icon: Type },
  { action: "environment", label: "环境描写", icon: Type },
  { action: "summary", label: "总结本章", icon: FileText },
];

const CHAPTER_STATUS_FLOW: { value: WritingChapterStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "revised", label: "修改中" },
  { value: "finished", label: "已完成" },
];

const MATERIAL_TYPES = Object.entries(WRITING_MATERIAL_TYPE_LABELS) as [WritingMaterialType, string][];

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
  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [docTick, setDocTick] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineText, setOutlineText] = useState("");

  // 章节重命名（章节管理抽屉内联）
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  // 素材箱
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<WritingMaterialType | "all">("all");
  const [materialEditing, setMaterialEditing] = useState<WritingMaterial | null>(null);
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [materialDraft, setMaterialDraft] = useState<{
    text: string;
    type: WritingMaterialType;
    tags: string;
    injectIntoContext: boolean;
  }>({ text: "", type: "inspiration", tags: "", injectIntoContext: false });

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flash = useCallback((text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  }, []);

  const reloadProject = useCallback(() => setProject(getWritingProject(projectId)), [projectId]);

  // 加载项目 + 恢复最近章节
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
    if (activeChapterId && project) {
      saveChapterContent(projectId, activeChapterId, content);
    }
    setActiveChapterId(chapterId);
    const doc = loadChapterDoc(projectId, chapterId);
    setContent(doc.content);
    setAiPreview(null);
    setDocTick(t => t + 1);
  };

  const handleAddChapter = () => {
    const meta = addWritingChapter(projectId);
    if (!meta) return;
    reloadProject();
    switchChapter(meta.id);
    setChapterSheetOpen(false);
    flash("已新建章节");
  };

  const handleDeleteChapter = (chapterId: string) => {
    if (!project) return;
    deleteWritingChapter(projectId, chapterId);
    const refreshed = getWritingProject(projectId);
    setProject(refreshed);
    if (activeChapterId === chapterId) {
      const next = refreshed?.chapters[0] ?? null;
      if (next) switchChapter(next.id);
      else {
        setActiveChapterId(null);
        setContent("");
      }
    }
    flash("已删除章节");
  };

  const handleDuplicateChapter = (chapterId: string) => {
    const meta = duplicateWritingChapter(projectId, chapterId);
    reloadProject();
    if (meta) switchChapter(meta.id);
    flash("已复制章节");
  };

  const handleMoveChapter = (chapterId: string, direction: -1 | 1) => {
    moveWritingChapter(projectId, chapterId, direction);
    reloadProject();
  };

  const commitRenameChapter = () => {
    if (!renamingChapterId) return;
    updateWritingChapterMeta(projectId, renamingChapterId, { title: renamingValue.trim() || "未命名章节" });
    setRenamingChapterId(null);
    reloadProject();
  };

  const runGeneration = async (action: WritingAction, instruction?: string) => {
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
        instruction,
        signal: ctrl.signal,
      });
      setAiPreview(result.text);
    } catch (error) {
      if (error instanceof WritingAiError) flash(error.message);
      else flash("生成失败，请重试");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerate = (action: WritingAction) => runGeneration(action);
  const handleGenerateSelection = (action: WritingAction, label?: string) => {
    if (!selectionMenu) return;
    const text = selectionMenu.text;
    setSelectionMenu(null);
    runGeneration(action, label ? `目标语气：${label}。\n段落：${text}` : text);
  };

  const applyAiText = (text: string, mode: "insert-cursor" | "replace-selection" | "append") => {
    const editor = editorRef.current;
    if (!editor || !activeChapterId) return;
    let nextContent: string;
    if (mode === "append") {
      nextContent = content + "\n\n" + text;
      flash("已追加到末尾");
    } else if (mode === "replace-selection" && editor.selectionStart !== editor.selectionEnd) {
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      nextContent = content.slice(0, start) + text + content.slice(end);
      flash("已替换选区");
    } else {
      const pos = editor.selectionStart;
      nextContent = content.slice(0, pos) + text + content.slice(pos);
      flash("已插入");
    }
    // AI 结果落正文前：先把编辑器里最新正文持久化并压入版本历史（AI 操作前），原文不丢失
    saveChapterContent(projectId, activeChapterId, content);
    snapshotChapterVersion(projectId, activeChapterId, "AI 操作前");
    setContent(nextContent);
    setAiPreview(null);
    setDocTick(t => t + 1);
  };

  const handleManualSnapshot = () => {
    if (!activeChapterId) return;
    // 先 flush 编辑器中尚未自动保存的内容，再压版本
    saveChapterContent(projectId, activeChapterId, content);
    snapshotChapterVersion(projectId, activeChapterId, "手动保存");
    setDocTick(t => t + 1);
    flash("已保存当前版本");
  };

  const handleRestoreVersion = (index: number) => {
    if (!activeChapterId) return;
    const restored = restoreChapterVersion(projectId, activeChapterId, index);
    if (restored !== null) {
      setContent(restored);
      setDocTick(t => t + 1);
      flash("已恢复版本（恢复前已自动备份）");
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
      lines.push(loadChapterDoc(projectId, meta.id).content);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
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
    reloadProject();
    setFinishConfirmOpen(false);
    flash("作品已标记为完成");
  };

  const handlePublish = () => {
    if (!project) return;
    const book = publishProjectAsBook(projectId);
    if (!book) {
      flash("发布失败：没有可发布的正文");
      return;
    }
    addToShelf(book.id, "generated");
    reloadProject();
    flash("已加入书架");
  };

  const handleSaveOutline = () => {
    if (!project) return;
    const items = [];
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
    reloadProject();
    setEditingOutline(false);
    flash("大纲已保存");
  };

  /* ── 素材箱 ── */
  const openMaterialEditor = (material?: WritingMaterial) => {
    if (material) {
      setMaterialEditing(material);
      setMaterialDraft({
        text: material.text,
        type: material.type ?? "custom",
        tags: (material.tags ?? []).join(", "),
        injectIntoContext: Boolean(material.injectIntoContext),
      });
    } else {
      setMaterialEditing(null);
      setMaterialDraft({ text: "", type: "inspiration", tags: "", injectIntoContext: false });
    }
    setMaterialEditorOpen(true);
  };

  const saveMaterialDraft = () => {
    const text = materialDraft.text.trim();
    if (!text) {
      flash("素材内容不能为空");
      return;
    }
    const tags = materialDraft.tags.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    if (materialEditing) {
      updateWritingMaterial(projectId, materialEditing.id, {
        text,
        type: materialDraft.type,
        tags,
        injectIntoContext: materialDraft.injectIntoContext,
      });
      flash("素材已更新");
    } else {
      addWritingMaterial(projectId, text, {
        type: materialDraft.type,
        tags,
        injectIntoContext: materialDraft.injectIntoContext,
      });
      flash("素材已添加");
    }
    setMaterialEditorOpen(false);
    reloadProject();
  };

  const handleRemoveMaterial = (materialId: string) => {
    removeWritingMaterial(projectId, materialId);
    reloadProject();
    flash("素材已删除");
  };

  const filteredMaterials = useMemo(() => {
    if (!project) return [];
    const q = materialQuery.trim().toLowerCase();
    return project.materials
      .filter(m => materialTypeFilter === "all" || (m.type ?? "custom") === materialTypeFilter)
      .filter(m => !q || m.text.toLowerCase().includes(q) || (m.tags ?? []).some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [project, materialQuery, materialTypeFilter]);

  const activeChapter = project?.chapters.find(c => c.id === activeChapterId) ?? null;
  const versions = useMemo(
    () => (activeChapterId ? loadChapterDoc(projectId, activeChapterId).versions : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeChapterId, docTick, project?.updatedAt],
  );
  const sortedChapters = useMemo(
    () => (project ? project.chapters.slice().sort((a, b) => a.order - b.order) : []),
    [project],
  );
  const totalWords = project ? getWritingTotalWords(project) : 0;
  const generatedBookId = project?.publishedBookId ?? (project ? `generated-${project.id}` : "");
  const shelved = Boolean(getShelfEntry(generatedBookId));

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
          <button type="button" className="book-icon-btn book-pressable" onClick={onBack} aria-label="返回书桌">
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="book-title-stack">
          <h1 className="book-title">{project.title}</h1>
          <p className="book-subtitle">{totalWords.toLocaleString()} 字 · {project.chapters.length} 章</p>
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
                {sortedChapters.map(meta => (
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
                  onClick={() => setChapterSheetOpen(true)}
                  title="章节管理"
                >
                  <Layers size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="book-icon-btn book-pressable"
                  onClick={handleManualSnapshot}
                  title="保存版本"
                >
                  <Save size={15} strokeWidth={2} />
                </button>
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
              </div>
            </div>

            {activeChapter ? (
              <>
                <input
                  type="text"
                  className="br-chapter-title-input"
                  value={activeChapter.title}
                  onChange={e => {
                    updateWritingChapterMeta(projectId, activeChapter.id, { title: e.target.value });
                    reloadProject();
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
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("tone", "更自然")}>更自然</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("tone", "更有张力")}>更有张力</button>
                        <button type="button" className="book-pressable" onClick={() => handleGenerateSelection("continue")}>生成后续</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="br-ai-toolbar">
                  <span className="br-ai-toolbar-label">AI</span>
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
            ) : (
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
                    project.outline.map(o => `${o.title}${o.summary ? "｜" + o.summary : ""}`).join("\n"),
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

        {activeTab === "material" && (
          <div className="br-material-panel">
            <div className="br-material-toolbar">
              <div className="br-material-search">
                <Search size={13} strokeWidth={2} />
                <input
                  type="text"
                  placeholder="搜索素材 / 标签"
                  value={materialQuery}
                  onChange={e => setMaterialQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="br-primary-btn book-pressable"
                onClick={() => openMaterialEditor()}
              >
                <Plus size={14} strokeWidth={2} />
                添加素材
              </button>
            </div>
            <div className="br-chip-group br-material-typebar">
              <button
                type="button"
                className={`br-chip book-pressable ${materialTypeFilter === "all" ? "is-active" : ""}`}
                onClick={() => setMaterialTypeFilter("all")}
              >
                全部
              </button>
              {MATERIAL_TYPES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`br-chip book-pressable ${materialTypeFilter === value ? "is-active" : ""}`}
                  onClick={() => setMaterialTypeFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="br-material-cards">
              {filteredMaterials.length === 0 && (
                <p className="br-outline-empty">
                  {project.materials.length === 0 ? "还没有素材，添加的素材只属于这部作品" : "没有匹配的素材"}
                </p>
              )}
              {filteredMaterials.map(m => (
                <div key={m.id} className={`br-material-card book-glass ${m.injectIntoContext ? "is-inject" : ""}`}>
                  <div className="br-material-card-head">
                    <span className="br-material-type-badge">
                      {WRITING_MATERIAL_TYPE_LABELS[m.type ?? "custom"]}
                    </span>
                    <div className="br-material-card-actions">
                      <button
                        type="button"
                        className={`br-material-inject book-pressable ${m.injectIntoContext ? "is-on" : ""}`}
                        title="是否注入 AI 写作上下文"
                        onClick={() => {
                          updateWritingMaterial(projectId, m.id, { injectIntoContext: !m.injectIntoContext });
                          reloadProject();
                        }}
                      >
                        {m.injectIntoContext ? <Check size={11} strokeWidth={2.4} /> : null}
                        注入
                      </button>
                      <button type="button" className="book-icon-btn book-pressable" onClick={() => openMaterialEditor(m)} aria-label="编辑素材">
                        <Pencil size={13} strokeWidth={2} />
                      </button>
                      <button type="button" className="book-icon-btn book-pressable" onClick={() => handleRemoveMaterial(m.id)} aria-label="删除素材">
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <p className="br-material-card-text">{m.text}</p>
                  {m.tags && m.tags.length > 0 && (
                    <div className="br-material-tags">
                      {m.tags.map(tag => <span key={tag} className="br-material-tag">#{tag}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                    reloadProject();
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
                      reloadProject();
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
                    reloadProject();
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
                    reloadProject();
                  }}
                />
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
                <div className="br-publish-box">
                  <button type="button" className="br-primary-btn book-pressable" onClick={handlePublish}>
                    <BookOpenCheck size={15} strokeWidth={2} />
                    {shelved ? "更新书架版本" : "加入书架"}
                  </button>
                  <p className="br-publish-hint">
                    {shelved
                      ? "已在书架中：书架负责阅读，书桌继续保留创作工程。"
                      : "加入书架后可在书房书架进入阅读器，作品仍保留在书桌。"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 章节管理抽屉（BottomSheet） */}
      {chapterSheetOpen && (
        <BottomSheet title="章节管理" onClose={() => { setChapterSheetOpen(false); setRenamingChapterId(null); }} panelClassName="br-chapter-sheet">
          <div className="br-chapter-manage">
            <button type="button" className="br-chapter-manage-add book-pressable" onClick={handleAddChapter}>
              <Plus size={15} strokeWidth={2} /> 新建章节
            </button>
            <div className="br-chapter-manage-list">
              {sortedChapters.length === 0 && <p className="br-outline-empty">还没有章节</p>}
              {sortedChapters.map((meta, index) => (
                <div key={meta.id} className="br-chapter-manage-item">
                  {renamingChapterId === meta.id ? (
                    <div className="br-chapter-rename-row">
                      <input
                        type="text"
                        className="br-input"
                        value={renamingValue}
                        autoFocus
                        onChange={e => setRenamingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitRenameChapter(); if (e.key === "Escape") setRenamingChapterId(null); }}
                      />
                      <button type="button" className="book-icon-btn book-pressable" onClick={commitRenameChapter} aria-label="确认">
                        <Check size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="br-chapter-manage-main book-pressable"
                        onClick={() => { switchChapter(meta.id); setChapterSheetOpen(false); }}
                      >
                        <span className="br-chapter-manage-title">{meta.title}</span>
                        <span className="br-chapter-manage-meta">{meta.wordCount.toLocaleString()} 字</span>
                      </button>
                      <div className="br-chapter-manage-tools">
                        {CHAPTER_STATUS_FLOW.map(s => (
                          <button
                            key={s.value}
                            type="button"
                            className={`br-chapter-status book-pressable ${meta.status === s.value ? "is-active" : ""}`}
                            onClick={() => { updateWritingChapterMeta(projectId, meta.id, { status: s.value }); reloadProject(); }}
                          >
                            {s.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="book-icon-btn book-pressable"
                          disabled={index === 0}
                          onClick={() => handleMoveChapter(meta.id, -1)}
                          aria-label="上移"
                        >
                          <ChevronUp size={14} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="book-icon-btn book-pressable"
                          disabled={index === sortedChapters.length - 1}
                          onClick={() => handleMoveChapter(meta.id, 1)}
                          aria-label="下移"
                        >
                          <ChevronDown size={14} strokeWidth={2} />
                        </button>
                        <button type="button" className="book-icon-btn book-pressable" onClick={() => { setRenamingChapterId(meta.id); setRenamingValue(meta.title); }} aria-label="重命名">
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                        <button type="button" className="book-icon-btn book-pressable" onClick={() => handleDuplicateChapter(meta.id)} aria-label="复制章节">
                          <Copy size={13} strokeWidth={2} />
                        </button>
                        <button type="button" className="book-icon-btn book-pressable" onClick={() => handleDeleteChapter(meta.id)} aria-label="删除章节">
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* 素材编辑 Sheet */}
      {materialEditorOpen && (
        <BottomSheet title={materialEditing ? "编辑素材" : "添加素材"} onClose={() => setMaterialEditorOpen(false)}>
          <div className="br-material-editor">
            <textarea
              className="br-input br-input-area"
              rows={5}
              placeholder="记录人物笔记、场景、情节碎片、台词或任何灵感……"
              value={materialDraft.text}
              onChange={e => setMaterialDraft(d => ({ ...d, text: e.target.value }))}
            />
            <div className="br-chip-group">
              {MATERIAL_TYPES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`br-chip book-pressable ${materialDraft.type === value ? "is-active" : ""}`}
                  onClick={() => setMaterialDraft(d => ({ ...d, type: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="br-input"
              placeholder="标签（逗号分隔）"
              value={materialDraft.tags}
              onChange={e => setMaterialDraft(d => ({ ...d, tags: e.target.value }))}
            />
            <button
              type="button"
              className={`br-material-inject book-pressable is-wide ${materialDraft.injectIntoContext ? "is-on" : ""}`}
              onClick={() => setMaterialDraft(d => ({ ...d, injectIntoContext: !d.injectIntoContext }))}
            >
              {materialDraft.injectIntoContext ? <Check size={12} strokeWidth={2.4} /> : null}
              允许注入 AI 写作上下文（默认关闭）
            </button>
            <div className="br-preview-actions">
              <button type="button" className="br-secondary-btn book-pressable" onClick={() => setMaterialEditorOpen(false)}>取消</button>
              <button type="button" className="br-primary-btn book-pressable" onClick={saveMaterialDraft}>保存素材</button>
            </div>
          </div>
        </BottomSheet>
      )}

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
              <button type="button" className="br-secondary-btn book-pressable" onClick={() => setAiPreview(null)}>
                放弃
              </button>
              <button type="button" className="br-secondary-btn book-pressable" onClick={() => applyAiText(aiPreview, "insert-cursor")}>
                插入光标处
              </button>
              <button type="button" className="br-secondary-btn book-pressable" onClick={() => applyAiText(aiPreview, "replace-selection")}>
                替换选区
              </button>
              <button type="button" className="br-primary-btn book-pressable" onClick={() => applyAiText(aiPreview, "append")}>
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
            <button type="button" className="br-version-savenow book-pressable" onClick={handleManualSnapshot}>
              <Save size={14} strokeWidth={2} /> 保存当前版本
            </button>
            {versions.length === 0 && <p className="br-version-empty">暂无历史版本（AI 应用前与手动保存时会自动留档）</p>}
            {versions.slice().reverse().map((v, reverseIndex) => {
              const index = versions.length - 1 - reverseIndex;
              return (
                <div key={index} className="br-version-item">
                  <div className="br-version-info">
                    <span className="br-version-label">{v.label || "历史版本"}</span>
                    <span className="br-version-time">
                      {new Date(v.savedAt).toLocaleString("zh-CN")} · {v.content.replace(/\s/g, "").length} 字
                    </span>
                  </div>
                  <button
                    type="button"
                    className="br-version-restore book-pressable"
                    onClick={() => handleRestoreVersion(index)}
                  >
                    <Undo2 size={14} strokeWidth={2} />
                    恢复
                  </button>
                </div>
              );
            })}
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
              <p>标记为完成后，可将其生成书架成书。项目仍会保留在书桌。</p>
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
