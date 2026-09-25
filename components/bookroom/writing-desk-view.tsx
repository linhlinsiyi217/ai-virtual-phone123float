"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpenCheck,
  ChevronRight,
  Copy,
  Feather,
  Globe,
  Inbox,
  Library,
  ListTree,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import {
  listWritingProjects,
  deleteWritingProject,
  duplicateWritingProject,
  renameWritingProject,
  setWritingFavorite,
  setWritingPinned,
  setWritingStatus,
  publishProjectAsBook,
  getWritingTotalWords,
  WRITING_MATERIAL_TYPE_LABELS,
  type WritingProject,
  type WritingStatus,
} from "@/lib/bookroom-writing";
import { addToShelf, getShelfEntry } from "@/lib/bookroom-shelf";
import { loadCharacters } from "@/lib/character-storage";
import { loadCharacterWorldGroups } from "@/lib/character-world-storage";
import { loadWorldBooks } from "@/lib/settings-storage";
import { BottomSheet, BrToast } from "./bookroom-ui";

export type DeskFilter = "all" | "writing" | "draft" | "finished" | "archived";
export type DeskSort = "updated" | "created" | "name" | "words" | "custom";

export type DeskUiState = {
  filter: DeskFilter;
  sort: DeskSort;
  scrollTop: number;
};

type Props = {
  onOpenProject: (projectId: string) => void;
  onCreate: (opts?: { mode: "quick"; idea?: string }) => void;
  uiState: DeskUiState;
  onUiStateChange: (patch: Partial<DeskUiState>) => void;
};

/** Phase 9B：书桌 2×2 工作入口（版本历史入口保留在项目工作台内） */
type DeskTool = "materials" | "roles" | "world" | "outline";

const DESK_TOOLS: { id: DeskTool; label: string; title: string; icon: typeof Inbox }[] = [
  { id: "materials", label: "灵感", title: "灵感收纳箱", icon: Inbox },
  { id: "roles", label: "角色", title: "人物 / 角色", icon: Users },
  { id: "world", label: "世界", title: "世界设定", icon: Globe },
  { id: "outline", label: "大纲", title: "章节大纲", icon: ListTree },
];

const FILTERS: { value: DeskFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "writing", label: "正在写" },
  { value: "draft", label: "草稿" },
  { value: "finished", label: "已完成" },
  { value: "archived", label: "已归档" },
];

const SORTS: { value: DeskSort; label: string }[] = [
  { value: "updated", label: "最近编辑" },
  { value: "created", label: "最近创建" },
  { value: "name", label: "名称" },
  { value: "words", label: "字数" },
  { value: "custom", label: "自定义排序" },
];

const STATUS_META: Record<WritingStatus, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "is-draft" },
  writing: { label: "正在写", cls: "is-writing" },
  paused: { label: "已暂停", cls: "is-paused" },
  finished: { label: "已完成", cls: "is-finished" },
  archived: { label: "已归档", cls: "is-archived" },
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  if (diff < min) return "刚刚";
  if (diff < 60 * min) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))} 小时前`;
  if (diff < 30 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

/**
 * 书桌主页（Phase 7A）：写作项目管理中心。
 * 数据唯一真源 = Phase 6A WritingProject；角色 / 世界卷宗 / 世界书实时读 canonical。
 */
export function WritingDeskView({ onOpenProject, onCreate, uiState, onUiStateChange }: Props) {
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const [quickIdea, setQuickIdea] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [actionProject, setActionProject] = useState<WritingProject | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WritingProject | null>(null);
  // Phase 9A P1：工具入口 BottomSheet
  const [toolSheet, setToolSheet] = useState<DeskTool | null>(null);
  const scrollElRef = useRef<Element | null>(null);
  const rafRef = useRef<number | null>(null);

  // canonical 真源：项目变化（绑定变更）时重新读取角色与卷宗
  const characters = useMemo(() => {
    try { return loadCharacters(); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);
  const worldGroups = useMemo(() => {
    try { return loadCharacterWorldGroups(); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);
  const worldBooks = useMemo(() => {
    try { return loadWorldBooks(); } catch { return []; }
  }, []);

  const refresh = () => setProjects(listWritingProjects());

  useEffect(() => {
    refresh();
    // 恢复离开工作台前的滚动位置
    const scroller = document.querySelector(".bookroom-app .br-body");
    scrollElRef.current = scroller;
    if (scroller && uiState.scrollTop > 0) {
      requestAnimationFrame(() => scroller.scrollTop = uiState.scrollTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 滚动位置持久化（rAF 节流），返回书桌后可恢复
  useEffect(() => {
    const scroller = scrollElRef.current;
    if (!scroller) return;
    const onScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onUiStateChange({ scrollTop: scroller.scrollTop });
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1800);
  };

  const sortProjects = (list: WritingProject[]) => {
    const sorted = list.slice();
    sorted.sort((a, b) => {
      // 置顶永远最前
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      switch (uiState.sort) {
        case "created": return b.createdAt - a.createdAt;
        case "name": return a.title.localeCompare(b.title, "zh-CN");
        case "words": return getWritingTotalWords(b) - getWritingTotalWords(a);
        case "custom": {
          const ao = a.deskOrder ?? Number.MAX_SAFE_INTEGER;
          const bo = b.deskOrder ?? Number.MAX_SAFE_INTEGER;
          return ao === bo ? b.updatedAt - a.updatedAt : ao - bo;
        }
        case "updated":
        default: return b.updatedAt - a.updatedAt;
      }
    });
    return sorted;
  };

  const groups = useMemo(() => {
    const map: Record<DeskFilter, WritingProject[]> = {
      all: [],
      writing: sortProjects(projects.filter(p => p.status === "writing")),
      draft: sortProjects(projects.filter(p => p.status === "draft" || p.status === "paused")),
      finished: sortProjects(projects.filter(p => p.status === "finished")),
      archived: sortProjects(projects.filter(p => p.status === "archived")),
    };
    map.all = sortProjects(projects.filter(p => p.status !== "archived"));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, uiState.sort]);

  // 轻量上下文区域：当前项目实际绑定的角色 / 世界卷宗 / 世界书（canonical，不存快照）
  const contextSummary = useMemo(() => {
    const visibleProjects = projects.filter(p => p.status !== "archived");
    const roleIds = Array.from(new Set(visibleProjects.flatMap(p => p.roleIds)));
    const roles = roleIds
      .map(id => characters.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 6);
    const groupIds = Array.from(new Set(visibleProjects.map(p => p.worldArchiveId).filter((x): x is string => Boolean(x))));
    const groups = groupIds
      .map(id => worldGroups.find(g => g.id === id))
      .filter((g): g is NonNullable<typeof g> => Boolean(g));
    const wbIds = Array.from(new Set(visibleProjects.flatMap(p => p.lorebookIds ?? [])));
    const books = wbIds
      .map(id => worldBooks.find(b => b.id === id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    return { roles, groups, books };
  }, [projects, characters, worldGroups, worldBooks]);

  const currentChapterTitle = (p: WritingProject): string => {
    const meta = p.chapters.find(c => c.id === p.lastChapterId);
    if (meta) return meta.title;
    const first = p.chapters.slice().sort((a, b) => a.order - b.order)[0];
    return first?.title ?? "尚未建章";
  };

  // Phase 9A P1：最近作品（非归档，按更新时间前 6）
  const recentProjects = useMemo(
    () => projects
      .filter(p => p.status !== "archived")
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6),
    [projects],
  );

  /* ── Phase 9A P1：工具聚合数据（真实读取，无 mock；打开时才聚合） ── */
  const visibleProjects = useMemo(() => projects.filter(p => p.status !== "archived"), [projects]);

  const toolMaterials = useMemo(() => {
    if (toolSheet !== "materials") return [];
    return visibleProjects
      .flatMap(p => p.materials.map(m => ({
        id: m.id,
        projectId: p.id,
        projectTitle: p.title,
        typeLabel: m.type ? (WRITING_MATERIAL_TYPE_LABELS[m.type] ?? "自定义") : "灵感",
        text: m.text,
        updatedAt: m.updatedAt ?? m.createdAt,
      })))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
  }, [toolSheet, visibleProjects]);

  const toolRoles = useMemo(() => {
    if (toolSheet !== "roles") return [];
    const ids = Array.from(new Set(visibleProjects.flatMap(p => p.roleIds)));
    return ids
      .map(id => {
        const c = characters.find(ch => ch.id === id);
        if (!c) return null;
        return {
          id,
          name: c.name,
          avatar: c.avatar,
          projects: visibleProjects.filter(p => p.roleIds.includes(id)).map(p => p.title),
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
  }, [toolSheet, visibleProjects, characters]);

  const toolWorld = useMemo(() => {
    if (toolSheet !== "world") return { groups: [] as { id: string; name: string; projects: string[] }[], books: [] as { id: string; name: string; projects: string[] }[] };
    const groupIds = Array.from(new Set(visibleProjects.map(p => p.worldArchiveId).filter((x): x is string => Boolean(x))));
    const groups = groupIds
      .map(id => {
        const g = worldGroups.find(item => item.id === id);
        if (!g) return null;
        return { id, name: g.name, projects: visibleProjects.filter(p => p.worldArchiveId === id).map(p => p.title) };
      })
      .filter((g): g is NonNullable<typeof g> => Boolean(g));
    const wbIds = Array.from(new Set(visibleProjects.flatMap(p => p.lorebookIds ?? [])));
    const books = wbIds
      .map(id => {
        const b = worldBooks.find(item => item.id === id);
        if (!b) return null;
        return { id, name: b.name, projects: visibleProjects.filter(p => (p.lorebookIds ?? []).includes(id)).map(p => p.title) };
      })
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    return { groups, books };
  }, [toolSheet, visibleProjects, worldGroups, worldBooks]);

  const toolOutlines = useMemo(() => {
    if (toolSheet !== "outline") return [];
    return visibleProjects
      .filter(p => p.outline.length > 0)
      .map(p => ({
        projectId: p.id,
        title: p.title,
        items: p.outline.slice(0, 5),
        total: p.outline.length,
      }));
  }, [toolSheet, visibleProjects]);

  const inShelf = (p: WritingProject): boolean => Boolean(getShelfEntry(p.publishedBookId ?? `generated-${p.id}`));

  const openActions = (p: WritingProject) => setActionProject(p);

  const handleQuickStart = () => {
    const idea = quickIdea.trim();
    if (!idea) {
      flash("写一句你的故事灵感");
      return;
    }
    onCreate({ mode: "quick", idea });
  };

  const handlePublish = (p: WritingProject) => {
    const book = publishProjectAsBook(p.id);
    if (!book) {
      flash("还没有可加入书架的正文");
      return;
    }
    addToShelf(book.id, "generated");
    setActionProject(null);
    refresh();
    flash("已加入书架，可在书架中阅读");
  };

  const renderCard = (p: WritingProject) => {
    const status = STATUS_META[p.status] ?? STATUS_META.draft;
    const roles = p.roleIds
      .map(id => characters.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 3);
    const group = p.worldArchiveId ? worldGroups.find(g => g.id === p.worldArchiveId) : null;
    const wbCount = p.lorebookIds?.length ?? 0;
    const shelved = inShelf(p);
    return (
      <div key={p.id} className={`br-desk-card book-glass ${p.pinned ? "is-pinned" : ""}`}>
        <button
          type="button"
          className="br-desk-card-main book-pressable"
          onClick={() => onOpenProject(p.id)}
        >
          <span className="br-desk-card-head">
            <span className="br-desk-card-title">{p.title}</span>
            <span className={`br-draft-kind ${status.cls}`}>{status.label}</span>
          </span>
          <span className="br-desk-card-chapter">
            <Feather size={11} strokeWidth={2} />
            {currentChapterTitle(p)}
          </span>
          <span className="br-desk-card-meta">
            {getWritingTotalWords(p).toLocaleString()} 字 · {formatRelative(p.updatedAt)}
          </span>
          <span className="br-desk-card-badges">
            {roles.map(r => (
              <span key={r.id} className="br-desk-badge-avatar" title={r.name}>
                {r.avatar ? <img src={r.avatar} alt="" /> : r.name.slice(0, 1)}
              </span>
            ))}
            {group && <span className="br-desk-badge-text">{group.name}</span>}
            {wbCount > 0 && <span className="br-desk-badge-text">{wbCount} 本世界书</span>}
            {shelved && (
              <span className="br-desk-badge-text is-shelf">
                <Library size={10} strokeWidth={2} />
                在书架
              </span>
            )}
          </span>
        </button>
        <div className="br-desk-card-side">
          <button
            type="button"
            className={`book-icon-btn book-pressable ${p.favorite ? "is-fav" : ""}`}
            onClick={() => { setWritingFavorite(p.id, !p.favorite); refresh(); }}
            aria-label="收藏"
          >
            <Star size={14} strokeWidth={2} fill={p.favorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="book-icon-btn book-pressable"
            onClick={() => openActions(p)}
            aria-label="更多操作"
          >
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (filter: DeskFilter, title: string) => {
    const list = groups[filter];
    if (uiState.filter !== "all" && uiState.filter !== filter) return null;
    if (list.length === 0 && uiState.filter !== "all") {
      return (
        <section className="book-section">
          <h2 className="book-section-title">{title}</h2>
          <div className="br-desk-section-empty book-glass">
            <p>这里还没有作品</p>
          </div>
        </section>
      );
    }
    if (list.length === 0) return null;
    return (
      <section className="book-section">
        <div className="book-section-head">
          <h2 className="book-section-title">{title}</h2>
          <span className="book-section-more">{list.length}</span>
        </div>
        <div className="br-desk-card-list">{list.map(renderCard)}</div>
      </section>
    );
  };

  const hasAnyProject = projects.length > 0;

  return (
    <>
      {/* ── Phase 9B：顶部标题 + 轻副标题 ── */}
      <header className="br-desk-head">
        <h2 className="br-desk-title">书桌</h2>
        <p className="br-desk-subtitle">人设 × 记忆 × AI，把故事慢慢写完</p>
      </header>

      {/* ── Phase 9B：最近作品（横向紧凑纸卡，非归档前 6） ── */}
      {hasAnyProject && recentProjects.length > 0 && (
        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">最近作品</h2>
          </div>
          <div className="br-desk-recent-row">
            {recentProjects.map(p => (
              <button
                key={p.id}
                type="button"
                className="br-desk-recent-card book-pressable"
                onClick={() => onOpenProject(p.id)}
              >
                <span className="br-desk-recent-title">{p.title}</span>
                <span className="br-desk-recent-chapter">{currentChapterTitle(p)}</span>
                <span className="br-desk-recent-meta">
                  {getWritingTotalWords(p).toLocaleString()} 字 · {formatRelative(p.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 快速开始：一句话创建 + 手动新建 ── */}
      <section className="book-section">
        <div className="br-desk-quick book-glass">
          <Sparkles size={15} strokeWidth={2} className="br-desk-quick-icon" />
          <input
            type="text"
            className="br-desk-quick-input"
            placeholder="一句话快速开始，如：写一个民国悬疑故事"
            value={quickIdea}
            onChange={e => setQuickIdea(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleQuickStart(); }}
          />
          <button type="button" className="br-desk-quick-btn book-pressable" onClick={handleQuickStart}>
            <Search size={13} strokeWidth={2} />
            开始
          </button>
          <button
            type="button"
            className="book-icon-btn book-pressable br-desk-quick-new"
            onClick={() => onCreate()}
            aria-label="手动新建作品"
            title="手动新建作品"
          >
            <Plus size={16} strokeWidth={2.2} />
          </button>
        </div>
      </section>

      {/* ── Phase 9B：2×2 工作入口（灵感 / 角色 / 世界 / 大纲） ── */}
      <section className="book-section">
        <div className="br-desk-tools-grid">
          {DESK_TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className="br-desk-tool book-pressable"
                onClick={() => setToolSheet(tool.id)}
                aria-label={tool.title}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span className="br-desk-tool-label">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {hasAnyProject && (
        <section className="book-section">
          <div className="br-desk-context book-glass">
            <span className="br-desk-context-label">写作上下文</span>
            <span className="br-desk-context-row">
              {contextSummary.roles.map(r => (
                <span key={r.id} className="br-desk-badge-avatar" title={r.name}>
                  {r.avatar ? <img src={r.avatar} alt="" /> : r.name.slice(0, 1)}
                </span>
              ))}
              {contextSummary.groups.map(g => (
                <span key={g.id} className="br-desk-badge-text">{g.name}</span>
              ))}
              {contextSummary.books.map(b => (
                <span key={b.id} className="br-desk-badge-text is-wb">{b.name}</span>
              ))}
              {contextSummary.roles.length + contextSummary.groups.length + contextSummary.books.length === 0 && (
                <span className="br-desk-context-empty">尚未绑定角色或世界设定</span>
              )}
            </span>
          </div>
        </section>
      )}

      {hasAnyProject && (
        <section className="book-section">
          <div className="br-desk-filterbar">
            <div className="br-desk-filters">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  className={`br-desk-filter book-pressable ${uiState.filter === f.value ? "is-active" : ""}`}
                  onClick={() => onUiStateChange({ filter: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="br-desk-sort-btn book-pressable"
              onClick={() => setSortOpen(true)}
            >
              {SORTS.find(s => s.value === uiState.sort)?.label}
              <ChevronRight size={13} strokeWidth={2} />
            </button>
          </div>
        </section>
      )}

      {!hasAnyProject ? (
        <section className="book-section">
          <div className="br-writing-empty book-glass">
            <Feather size={28} strokeWidth={1.6} />
            <p>书桌上还没有作品</p>
            <p className="br-writing-empty-desc">从一句话开始，创建你的第一部 AI 写作工程</p>
            <button type="button" className="br-writing-empty-btn book-pressable" onClick={() => onCreate()}>
              <Plus size={16} strokeWidth={2} />
              新建作品
            </button>
          </div>
        </section>
      ) : (
        <>
          {renderSection("writing", "正在写")}
          {renderSection("draft", "草稿")}
          {renderSection("finished", "已完成")}
          {renderSection("archived", "已归档")}
        </>
      )}

      <footer className="book-footer">BOOKROOM · DESK</footer>

      {/* ── Phase 9A P1：工具入口 Sheets（真实数据，空态真实文案） ── */}
      {toolSheet === "materials" && (
        <BottomSheet title="灵感收纳箱" onClose={() => setToolSheet(null)}>
          {toolMaterials.length === 0 ? (
            <p className="br-desk-tool-empty">还没有收纳灵感。在作品里记下片段、场景或人物笔记后会出现在这里。</p>
          ) : (
            <div className="br-desk-sheet-list">
              {toolMaterials.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="br-desk-tool-row book-pressable"
                  onClick={() => { setToolSheet(null); onOpenProject(m.projectId); }}
                >
                  <span className="br-desk-tool-row-head">
                    <span className="br-desk-tool-row-tag">{m.typeLabel}</span>
                    <span className="br-desk-tool-row-proj">{m.projectTitle}</span>
                  </span>
                  <span className="br-desk-tool-row-text">{m.text}</span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
      {toolSheet === "roles" && (
        <BottomSheet title="角色板" onClose={() => setToolSheet(null)}>
          {toolRoles.length === 0 ? (
            <p className="br-desk-tool-empty">还没有作品绑定角色。在写作工程里选择角色后，这里会列出他们。</p>
          ) : (
            <div className="br-desk-sheet-list">
              {toolRoles.map(r => (
                <div key={r.id} className="br-desk-tool-row is-static">
                  <span className="br-desk-tool-row-head">
                    <span className="br-desk-badge-avatar">
                      {r.avatar ? <img src={r.avatar} alt="" /> : r.name.slice(0, 1)}
                    </span>
                    <span className="br-desk-tool-row-name">{r.name}</span>
                  </span>
                  <span className="br-desk-tool-row-text">{r.projects.join("、")}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
      {toolSheet === "world" && (
        <BottomSheet title="世界设定 / 世界书" onClose={() => setToolSheet(null)}>
          {toolWorld.groups.length === 0 && toolWorld.books.length === 0 ? (
            <p className="br-desk-tool-empty">还没有绑定世界设定。在写作工程里选择世界卷宗或世界书后会显示在这里。</p>
          ) : (
            <div className="br-desk-sheet-list">
              {toolWorld.groups.map(g => (
                <div key={g.id} className="br-desk-tool-row is-static">
                  <span className="br-desk-tool-row-head">
                    <span className="br-desk-tool-row-tag">世界卷宗</span>
                    <span className="br-desk-tool-row-name">{g.name}</span>
                  </span>
                  <span className="br-desk-tool-row-text">{g.projects.join("、")}</span>
                </div>
              ))}
              {toolWorld.books.map(b => (
                <div key={b.id} className="br-desk-tool-row is-static">
                  <span className="br-desk-tool-row-head">
                    <span className="br-desk-tool-row-tag">世界书</span>
                    <span className="br-desk-tool-row-name">{b.name}</span>
                  </span>
                  <span className="br-desk-tool-row-text">{b.projects.join("、")}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
      {toolSheet === "outline" && (
        <BottomSheet title="章节大纲" onClose={() => setToolSheet(null)}>
          {toolOutlines.length === 0 ? (
            <p className="br-desk-tool-empty">还没有大纲。在作品工作台里可以让 AI 生成或手动添加章节大纲。</p>
          ) : (
            <div className="br-desk-sheet-list">
              {toolOutlines.map(row => (
                <button
                  key={row.projectId}
                  type="button"
                  className="br-desk-tool-row book-pressable"
                  onClick={() => { setToolSheet(null); onOpenProject(row.projectId); }}
                >
                  <span className="br-desk-tool-row-head">
                    <span className="br-desk-tool-row-name">{row.title}</span>
                    <span className="br-desk-tool-row-proj">{row.total} 节</span>
                  </span>
                  <span className="br-desk-tool-row-text">
                    {row.items.map(item => item.title).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {/* 排序选择 */}
      {sortOpen && (
        <BottomSheet title="排序方式" onClose={() => setSortOpen(false)}>
          <div className="br-desk-sheet-list">
            {SORTS.map(s => (
              <button
                key={s.value}
                type="button"
                className={`br-desk-sheet-row book-pressable ${uiState.sort === s.value ? "is-active" : ""}`}
                onClick={() => { onUiStateChange({ sort: s.value }); setSortOpen(false); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* 项目操作 */}
      {actionProject && (
        <BottomSheet title={actionProject.title} onClose={() => setActionProject(null)}>
          <div className="br-desk-sheet-list">
            <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
              setRenameValue(actionProject.title);
              setRenameOpen(true);
            }}>
              <Pencil size={15} strokeWidth={2} /> 重命名
            </button>
            <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
              setWritingFavorite(actionProject.id, !actionProject.favorite);
              setActionProject(null);
              refresh();
            }}>
              <Star size={15} strokeWidth={2} /> {actionProject.favorite ? "取消收藏" : "收藏"}
            </button>
            <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
              setWritingPinned(actionProject.id, !actionProject.pinned);
              setActionProject(null);
              refresh();
              flash(actionProject.pinned ? "已取消置顶" : "已置顶");
            }}>
              {actionProject.pinned ? <PinOff size={15} strokeWidth={2} /> : <Pin size={15} strokeWidth={2} />}
              {actionProject.pinned ? "取消置顶" : "置顶"}
            </button>
            <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
              const copy = duplicateWritingProject(actionProject.id);
              setActionProject(null);
              refresh();
              flash(copy ? "已复制项目" : "复制失败");
            }}>
              <Copy size={15} strokeWidth={2} /> 复制项目
            </button>
            {actionProject.status === "finished" && (
              <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => handlePublish(actionProject)}>
                <BookOpenCheck size={15} strokeWidth={2} />
                {inShelf(actionProject) ? "更新书架版本" : "加入书架"}
              </button>
            )}
            {actionProject.status === "archived" ? (
              <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
                setWritingStatus(actionProject.id, "writing");
                setActionProject(null);
                refresh();
                flash("已取消归档");
              }}>
                <ArchiveRestore size={15} strokeWidth={2} /> 取消归档
              </button>
            ) : (
              <button type="button" className="br-desk-sheet-row book-pressable" onClick={() => {
                setWritingStatus(actionProject.id, "archived");
                setActionProject(null);
                refresh();
                flash("已归档");
              }}>
                <Archive size={15} strokeWidth={2} /> 归档
              </button>
            )}
            <button
              type="button"
              className="br-desk-sheet-row book-pressable is-danger"
              onClick={() => { setDeleteTarget(actionProject); setActionProject(null); }}
            >
              <Trash2 size={15} strokeWidth={2} /> 删除项目
            </button>
          </div>
        </BottomSheet>
      )}

      {/* 重命名 */}
      {renameOpen && actionProject && (
        <BottomSheet title="重命名作品" onClose={() => setRenameOpen(false)}>
          <div className="br-desk-rename">
            <input
              type="text"
              className="br-input"
              value={renameValue}
              autoFocus
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") {
                renameWritingProject(actionProject.id, renameValue);
                setRenameOpen(false);
                refresh();
              } }}
            />
            <button type="button" className="br-primary-btn book-pressable" onClick={() => {
              renameWritingProject(actionProject.id, renameValue);
              setRenameOpen(false);
              refresh();
              flash("已重命名");
            }}>
              保存
            </button>
          </div>
        </BottomSheet>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <BottomSheet title="删除作品" onClose={() => setDeleteTarget(null)}>
          <div className="br-desk-rename">
            <p className="br-desk-delete-text">
              确定删除《{deleteTarget.title}》？全部章节正文与素材将被清除，此操作不可撤销。
              {inShelf(deleteTarget) ? "已加入书架的成书不受影响。" : ""}
            </p>
            <div className="br-preview-actions">
              <button type="button" className="br-secondary-btn book-pressable" onClick={() => setDeleteTarget(null)}>取消</button>
              <button type="button" className="br-primary-btn book-pressable is-danger" onClick={() => {
                deleteWritingProject(deleteTarget.id);
                setDeleteTarget(null);
                refresh();
                flash("已删除");
              }}>
                删除
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      <BrToast text={hint} />
    </>
  );
}
