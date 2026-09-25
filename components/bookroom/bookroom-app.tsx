"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { BookstoreHome } from "@/components/bookstore/bookstore-app";
import { BookstoreDetail } from "@/components/bookstore/bookstore-detail";
import { loadCompanionId, resolveShelfBook, saveCompanionId } from "@/lib/bookroom-shelf";
import { resolveCompanionRoles, type CompanionRole } from "@/lib/bookroom-mock";
import type { CoReadingSession } from "@/lib/bookroom-sessions";
import { BookroomDock, type BookroomTab } from "./bookroom-dock";
import { BookshelfView } from "./bookshelf-view";
import { WritingDeskView, type DeskUiState } from "./writing-desk-view";
import { WritingCreateSheet } from "./writing-create-sheet";
import { WritingProjectView } from "./writing-project-view";
import { MineView } from "./mine-view";
import { StatsView } from "./stats-view";
import { CoReadingHistoryView } from "./co-reading-history-view";
import { FavoriteQuotesView } from "./favorite-quotes-view";
import { RoleSwitcherDrawer } from "./role-switcher-drawer";
import { NightReadingSheet } from "./night-reading-sheet";
import { CoReadingChatSheet } from "./co-reading-chat-sheet";
import { AppearanceStudioSheet } from "./appearance-studio-sheet";
import { ReadingSkinSheet } from "./reading-skin-sheet";
import { injectBookroomAppearance } from "@/lib/bookroom-appearance";
import { BookroomSplash } from "./bookroom-splash";
import { ReadingView } from "./reading-view";
import { MangaReaderView } from "./manga-reader-view";

type Props = { onClose: () => void };

const TAB_META: Record<BookroomTab, { title: string; subtitle: string }> = {
  shelf: { title: "书架", subtitle: "MY BOOKSHELF" },
  store: { title: "书城", subtitle: "BOOKSTORE" },
  desk: { title: "书桌", subtitle: "WRITING DESK" },
  mine: { title: "我的", subtitle: "PROFILE" },
};

/**
 * 「书房」App 根组件 — Float 系统挂载点。
 *
 * 信息架构（Phase 2 Shell 重构）：
 *   Dock：书架 / 书城 / 书桌 / 我的（夜读、共读不再是一级入口）
 *   工具层：角色侧栏（右抽屉）、夜读/陪伴半弹窗、共读聊天半弹层、外观工作室、阅读皮肤
 *   导航栈：Dock 各页 ↔ 书籍详情 ↔ 文字阅读器；我的 → 统计 / 共读记录 / 收藏语录（子页）
 */
export default function BookRoomApp({ onClose }: Props) {
  const [tab, setTab] = useState<BookroomTab>("shelf");

  // 详情 / 阅读器
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [readingBook, setReadingBook] = useState<Book | null>(null);

  // 我的 → 统计 / 共读记录 / 收藏语录
  const [statsOpen, setStatsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);

  // 角色与浮层（角色列表实时重读真源：改名 / 换头像 / 删除后自动同步）
  const [roles, setRoles] = useState<CompanionRole[]>(() => resolveCompanionRoles());
  const [companionId, setCompanionId] = useState<string>(() => loadCompanionId() ?? "");
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [nightTarget, setNightTarget] = useState<{ book: Book; mode: "night" | "companion" } | null>(null);
  // Phase 9A：drawer=true 时共读聊天从右侧滑出（阅读页右上角入口）
  const [coTarget, setCoTarget] = useState<{ book: Book; initialAsk?: string; drawer?: boolean } | null>(null);

  // 外观与皮肤
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [skinsOpen, setSkinsOpen] = useState(false);

  // 书桌（Phase 7A）：工作台 / 新建面板参数 / 书桌筛选排序滚动位置（进入项目后仍保持）
  const [writingProjectId, setWritingProjectId] = useState<string | null>(null);
  const [createOpts, setCreateOpts] = useState<{ mode?: "quick"; idea?: string } | null>(null);
  const [deskUiState, setDeskUiState] = useState<DeskUiState>({ filter: "all", sort: "updated", scrollTop: 0 });

  // 角色相关界面打开时重新解析 canonical 角色卡，保证显示为最新版本
  useEffect(() => {
    setRoles(resolveCompanionRoles());
  }, [roleDrawerOpen, coTarget !== null, historyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 8B：启动即注入已保存的外观 token（深浅模式 / Pearl Glass 全局生效）
  useEffect(() => {
    const dispose = injectBookroomAppearance();
    return dispose;
  }, []);

  // 启动画面（文字分层显现 ~2.1s，整体淡出 ~0.5s，总时长 2.6s）
  const [splashFading, setSplashFading] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setSplashFading(true), 2100);
    const goneTimer = window.setTimeout(() => setSplashGone(true), 2620);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(goneTimer);
    };
  }, []);

  const companion = roles.find(role => role.id === companionId) ?? roles[0];

  const handleSelectRole = (role: CompanionRole) => {
    setCompanionId(role.id);
    saveCompanionId(role.id);
    setRoleDrawerOpen(false);
  };

  const openNight = (book: Book) => {
    setNightTarget({ book, mode: book.type === "manga" ? "companion" : "night" });
  };

  /** 共读记录 → 继续共读：切到该角色并打开共读聊天层（聊天层会自动继续未结束会话） */
  const handleResumeCoRead = (session: CoReadingSession) => {
    const book = resolveShelfBook(session.bookId, { withContent: true });
    if (!book) return;
    setCompanionId(session.roleId);
    saveCompanionId(session.roleId);
    setHistoryOpen(false);
    setCoTarget({ book });
  };

  /** 共读记录 → 回到阅读位置：有正文进阅读器；仅 metadata 快照（在线书）回详情页 */
  const handleBackToReading = (session: CoReadingSession) => {
    const book = resolveShelfBook(session.bookId, { withContent: true });
    if (!book) return;
    setHistoryOpen(false);
    const hasContent = (book.chapters?.length ?? 0) > 0 || (book.pages?.length ?? 0) > 0;
    if (hasContent) setReadingBook(book);
    else setActiveBook(book);
  };

  /** 收藏语录 → 跳回原文位置 */
  const handleJumpToAnnotation = (bookId: string) => {
    const book = resolveShelfBook(bookId, { withContent: true });
    if (!book) return;
    setQuotesOpen(false);
    setReadingBook(book);
  };

  /** 导入内容：切到书架 tab（书架页已有导入入口） */
  const handleOpenImport = () => {
    setTab("shelf");
  };

  const meta = TAB_META[tab];

  return (
    <div className="bookroom-app br-root">
      {readingBook ? (
        readingBook.type === "manga" ? (
          <MangaReaderView
            book={readingBook}
            onBack={() => setReadingBook(null)}
          />
        ) : (
          <ReadingView
            book={readingBook}
            onBack={() => setReadingBook(null)}
            onOpenNight={() => setNightTarget({ book: readingBook, mode: "night" })}
            onAskRole={(askText) => setCoTarget({ book: readingBook, initialAsk: askText })}
            onAiWrite={(idea) => setCreateOpts({ mode: "quick", idea })}
            companion={companion}
            onOpenCoRead={() => setCoTarget({ book: readingBook, drawer: true })}
          />
        )
      ) : activeBook ? (
        <BookstoreDetail
          book={activeBook}
          onBack={() => setActiveBook(null)}
          onStartReading={book => setReadingBook(book)}
          onCoRead={book => setCoTarget({ book })}
          onNight={openNight}
        />
      ) : historyOpen ? (
        <CoReadingHistoryView
          onBack={() => setHistoryOpen(false)}
          onResumeCoRead={handleResumeCoRead}
          onBackToReading={handleBackToReading}
        />
      ) : statsOpen ? (
        <StatsView onBack={() => setStatsOpen(false)} />
      ) : quotesOpen ? (
        <FavoriteQuotesView
          onBack={() => setQuotesOpen(false)}
          onJumpToBook={handleJumpToAnnotation}
        />
      ) : writingProjectId ? (
        <WritingProjectView
          projectId={writingProjectId}
          onBack={() => setWritingProjectId(null)}
        />
      ) : (
        <div className="br-page">
          <header className="book-header br-header">
            <div className="book-appbar">
              <button
                className="book-icon-btn book-pressable"
                type="button"
                onClick={onClose}
                aria-label="退出书房"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="br-role-entry book-pressable"
                onClick={() => setRoleDrawerOpen(true)}
                aria-label="选择陪读角色"
              >
                <span className="br-role-entry-avatar">
                  {companion.avatar ? <img src={companion.avatar} alt="" /> : companion.name.slice(0, 1)}
                </span>
                <span className={`br-role-dot br-role-dot-${companion.status}`} aria-hidden />
              </button>
            </div>
            <div className="book-title-stack">
              <h1 className="book-title">{meta.title}</h1>
              <p className="book-subtitle">{meta.subtitle}</p>
            </div>
          </header>

          <div className="book-body br-body">
            {tab === "shelf" && (
              <BookshelfView
                onOpenBook={setActiveBook}
                onContinue={book => setReadingBook(book)}
              />
            )}
            {tab === "store" && <BookstoreHome onOpenBook={setActiveBook} />}
            {tab === "desk" && (
              <WritingDeskView
                onOpenProject={id => setWritingProjectId(id)}
                onCreate={opts => setCreateOpts(opts ?? {})}
                uiState={deskUiState}
                onUiStateChange={patch => setDeskUiState(prev => ({ ...prev, ...patch }))}
              />
            )}
            {tab === "mine" && (
              <MineView
                role={companion}
                onOpenRoles={() => setRoleDrawerOpen(true)}
                onOpenStats={() => setStatsOpen(true)}
                onOpenHistory={() => setHistoryOpen(true)}
                onOpenQuotes={() => setQuotesOpen(true)}
                onOpenAppearance={() => setAppearanceOpen(true)}
                onOpenSkins={() => setSkinsOpen(true)}
                onOpenImport={handleOpenImport}
                onOpenDesk={() => setTab("desk")}
                onOpenShelf={() => setTab("shelf")}
              />
            )}
          </div>

          <BookroomDock active={tab} onChange={setTab} />
        </div>
      )}

      {/* 工具层：抽屉与半弹窗挂在根层，可覆盖详情 / 阅读器 */}
      {roleDrawerOpen && (
        <RoleSwitcherDrawer
          roles={roles}
          selectedId={companion.id}
          onSelect={handleSelectRole}
          onClose={() => setRoleDrawerOpen(false)}
        />
      )}

      {nightTarget && (
        <NightReadingSheet
          book={nightTarget.book}
          mode={nightTarget.mode}
          onClose={() => setNightTarget(null)}
        />
      )}

      {coTarget && (
        <CoReadingChatSheet
          book={coTarget.book}
          role={companion}
          kind={coTarget.book.type === "manga" ? "manga" : "book"}
          initialAsk={coTarget.initialAsk}
          variant={coTarget.drawer ? "drawer" : "sheet"}
          onChooseRole={() => {
            setCoTarget(null);
            setRoleDrawerOpen(true);
          }}
          onClose={() => setCoTarget(null)}
        />
      )}

      {appearanceOpen && (
        <AppearanceStudioSheet onClose={() => setAppearanceOpen(false)} />
      )}

      {skinsOpen && (
        <ReadingSkinSheet onClose={() => setSkinsOpen(false)} />
      )}

      {createOpts && (
        <WritingCreateSheet
          initialMode={createOpts.mode}
          initialIdea={createOpts.idea}
          onClose={() => setCreateOpts(null)}
          onCreated={id => {
            setCreateOpts(null);
            setWritingProjectId(id);
          }}
        />
      )}

      {/* 启动画面：最后渲染，覆盖一切 */}
      {!splashGone && (
        <div className={`br-splash-host ${splashFading ? "is-fading" : ""}`} aria-hidden={splashFading}>
          <BookroomSplash />
        </div>
      )}
    </div>
  );
}
