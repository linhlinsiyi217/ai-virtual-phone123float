"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  FolderPlus,
  Heart,
  Info,
  Pause,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import {
  listCollections,
  type BookshelfEntry,
  type ShelfStatus,
} from "@/lib/bookroom-shelf";
import { BottomSheet } from "./bookroom-ui";

type Props = {
  book: Book;
  entry: BookshelfEntry;
  /** 真实阅读进度 0~100 */
  percent: number;
  onClose: () => void;
  onRead: () => void;
  onDetail: () => void;
  onFavorite: (favorite: boolean) => void;
  onStatus: (status: ShelfStatus) => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromShelf: () => void;
  /** 仅 imported 书显示：删除导入解析内容 */
  onDeleteImported?: () => void;
};

const STATUS_META: Record<ShelfStatus, { label: string; activeLabel: string }> = {
  unread: { label: "标记为未读", activeLabel: "未读" },
  reading: { label: "标记为阅读中", activeLabel: "阅读中" },
  finished: { label: "标记为已读", activeLabel: "已读" },
  paused: { label: "标记为暂停", activeLabel: "暂停" },
};

/**
 * 书架选中书 / 长按操作面板（Phase 5A）。
 * 统一承载：继续阅读 / 详情 / 收藏 / 改状态 / 加入分组 / 移出书架 / 删除导入。
 * 点击书时先聚焦（不直接跳 ReadingView），长按也弹此面板。
 */
export function ShelfFocusSheet({
  book,
  entry,
  percent,
  onClose,
  onRead,
  onDetail,
  onFavorite,
  onStatus,
  onAddToCollection,
  onRemoveFromShelf,
  onDeleteImported,
}: Props) {
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const favorite = Boolean(entry.favorite);
  const isImported = book.source === "imported";

  const collections = listCollections();

  return (
    <BottomSheet title={book.title} onClose={onClose} panelClassName="br-shelf-focus">
      <section className="br-sheet-section">
        <div className="br-focus-meta">
          <span className="br-focus-author">{book.author}</span>
          <div className="book-progress">
            <div className="book-progress-track">
              <div className="book-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="book-progress-num">{percent}%</span>
          </div>
          <span className="br-focus-status">{STATUS_META[entry.status].activeLabel}</span>
        </div>
      </section>

      <section className="br-sheet-section br-focus-grid">
        <button
          type="button"
          className="br-focus-btn book-pressable"
          onClick={onRead}
        >
          <BookOpen size={18} strokeWidth={1.9} />
          <span>{percent > 0 ? "继续阅读" : "开始阅读"}</span>
        </button>

        <button
          type="button"
          className="br-focus-btn book-pressable"
          onClick={onDetail}
        >
          <Info size={18} strokeWidth={1.9} />
          <span>详情</span>
        </button>

        <button
          type="button"
          className={`br-focus-btn book-pressable ${favorite ? "is-fav" : ""}`}
          onClick={() => onFavorite(!favorite)}
        >
          <Heart size={18} strokeWidth={1.9} fill={favorite ? "currentColor" : "none"} />
          <span>{favorite ? "已收藏" : "收藏"}</span>
        </button>

        <button
          type="button"
          className="br-focus-btn book-pressable"
          onClick={() => setStatusOpen(v => !v)}
        >
          <Pause size={18} strokeWidth={1.9} />
          <span>改状态</span>
        </button>

        <button
          type="button"
          className="br-focus-btn book-pressable"
          onClick={() => setCollectionOpen(v => !v)}
        >
          <FolderPlus size={18} strokeWidth={1.9} />
          <span>加入分组</span>
        </button>
      </section>

      {statusOpen && (
        <section className="br-sheet-section br-focus-sub-list">
          {(Object.keys(STATUS_META) as ShelfStatus[]).map(s => (
            <button
              key={s}
              type="button"
              className="br-focus-sub-row book-pressable"
              onClick={() => {
                onStatus(s);
                setStatusOpen(false);
              }}
            >
              <span>{STATUS_META[s].label}</span>
              {entry.status === s && <Check size={14} strokeWidth={2.4} />}
            </button>
          ))}
        </section>
      )}

      {collectionOpen && (
        <section className="br-sheet-section br-focus-sub-list">
          {collections.length === 0 ? (
            <p className="br-focus-empty">还没有分组，可在书架顶部「分组」中创建。</p>
          ) : (
            collections.map(col => {
              const inCol = entry.collectionIds?.includes(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  className="br-focus-sub-row book-pressable"
                  onClick={() => onAddToCollection(col.id)}
                >
                  <span>{col.name}</span>
                  {inCol && <Check size={14} strokeWidth={2.4} />}
                </button>
              );
            })
          )}
        </section>
      )}

      <section className="br-sheet-section br-focus-danger">
        <button
          type="button"
          className="br-focus-sub-row book-pressable"
          onClick={onRemoveFromShelf}
        >
          <X size={15} strokeWidth={2} />
          <span>移出书架</span>
        </button>
        {isImported && onDeleteImported && (
          <button
            type="button"
            className="br-focus-sub-row book-pressable is-danger"
            onClick={onDeleteImported}
          >
            <Trash2 size={15} strokeWidth={2} />
            <span>删除导入内容</span>
          </button>
        )}
      </section>

      {isImported && (
        <p className="br-focus-foot">
          <Pencil size={12} strokeWidth={1.8} />
          移出书架不删除原文件；删除导入内容才会清除解析数据。
        </p>
      )}
    </BottomSheet>
  );
}
