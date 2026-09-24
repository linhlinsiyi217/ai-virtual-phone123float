"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpenCheck,
  ChevronRight,
  Copy,
  Feather,
  Library,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
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
      <section className="book-section">
        <button
          type="button"
          className="br-write-hero book-glass book-pressable"
          onClick={() => onCreate()}
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
