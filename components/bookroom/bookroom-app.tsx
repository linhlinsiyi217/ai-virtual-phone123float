"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { BookstoreHome } from "@/components/bookstore/bookstore-app";
import { BookstoreDetail } from "@/components/bookstore/bookstore-detail";
import { loadCompanionId, saveCompanionId } from "@/lib/bookroom-shelf";
import { resolveCompanionRoles, type CompanionRole } from "@/lib/bookroom-mock";
import { BookroomDock, type BookroomTab } from "./bookroom-dock";
import { BookshelfView } from "./bookshelf-view";
import { WritingDeskView } from "./writing-desk-view";
import { MineView } from "./mine-view";
import { StatsView } from "./stats-view";
import { RoleSwitcherDrawer } from "./role-switcher-drawer";
import { NightReadingSheet } from "./night-reading-sheet";
import { CoReadingChatSheet } from "./co-reading-chat-sheet";
import { ColorTuningSheet } from "./color-tuning-sheet";
import { BookroomSplash } from "./bookroom-splash";
import { ReadingView } from "./reading-view";

type Props = { onClose: () => void };

const TAB_META: Record<BookroomTab, { title: string; subtitle: string }> = {
  shelf: { title: "书架", subtitle: "MY BOOKSHELF" },
  store: { title: "书城", subtitle: "BOOKSTORE" },
  desk: { title: "书桌", subtitle: "WRITING DESK" },
  mine: { title: "我的", subtitle: "PROFILE" },
};

type ColorTab = "grid" | "spectrum" | "sliders";

/**
 * 「书房」App 根组件 — Float 系统挂载点。
 *
 * 信息架构（Phase 2 Shell 重构）：
 *   Dock：书架 / 书城 / 书桌 / 我的（夜读、共读不再是一级入口）
 *   工具层：角色侧栏（右抽屉）、夜读/陪伴半弹窗、共读聊天半弹层、颜色调试半弹窗
 *   导航栈：Dock 各页 ↔ 书籍详情 ↔ 文字阅读器；我的 → 统计（子页）
 */
export default function BookRoomApp({ onClose }: Props) {
  const [tab, setTab] = useState<BookroomTab>("shelf");

  // 详情 / 阅读器
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [readingBook, setReadingBook] = useState<Book | null>(null);

  // 我的 → 统计
  const [statsOpen, setStatsOpen] = useState(false);

  // 角色与浮层
  const roles = useMemo<CompanionRole[]>(resolveCompanionRoles, []);
  const [companionId, setCompanionId] = useState<string>(() => loadCompanionId() ?? "");
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [nightTarget, setNightTarget] = useState<{ book: Book; mode: "night" | "companion" } | null>(null);
  const [coTarget, setCoTarget] = useState<Book | null>(null);
  const [colorTab, setColorTab] = useState<ColorTab>("grid");
  const [colorOpen, setColorOpen] = useState(false);

  // 启动画面（静态结构 + 轻柔进出）
  const [splashFading, setSplashFading] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setSplashFading(true), 1350);
    const goneTimer = window.setTimeout(() => setSplashGone(true), 1850);
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

  const meta = TAB_META[tab];

  return (
    <div className="bookroom-app br-root">
      {readingBook ? (
        <ReadingView
          book={readingBook}
          onBack={() => setReadingBook(null)}
          onOpenNight={() => setNightTarget({ book: readingBook, mode: "night" })}
        />
      ) : activeBook ? (
        <BookstoreDetail
          book={activeBook}
          onBack={() => setActiveBook(null)}
          onStartReading={book => setReadingBook(book)}
          onCoRead={book => setCoTarget(book)}
          onNight={openNight}
        />
      ) : statsOpen ? (
        <StatsView onBack={() => setStatsOpen(false)} />
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
            {tab === "desk" && <WritingDeskView />}
            {tab === "mine" && (
              <MineView
                role={companion}
                onOpenRoles={() => setRoleDrawerOpen(true)}
                onOpenStats={() => setStatsOpen(true)}
                onOpenColor={tabName => {
                  setColorTab(tabName);
                  setColorOpen(true);
                }}
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
          book={coTarget}
          role={companion}
          kind={coTarget.type === "manga" ? "manga" : "book"}
          onClose={() => setCoTarget(null)}
        />
      )}

      {colorOpen && (
        <ColorTuningSheet initialTab={colorTab} onClose={() => setColorOpen(false)} />
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
