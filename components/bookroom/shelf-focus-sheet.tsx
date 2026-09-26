"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  Check,
  FolderPlus,
  Heart,
  ImagePlus,
  Info,
  Pause,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import {
  listCollections,
  setCustomCover,
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
  /** Phase 9A：自定义封面变更后通知父级刷新 */
  onCoverChange?: () => void;
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
  onCoverChange,
}: Props) {
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverHint, setCoverHint] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const favorite = Boolean(entry.favorite);
  const isImported = book.source === "imported";
  const hasCustomCover = Boolean(entry.customCover);

  const collections = listCollections();

  /* Phase 9A：自定义封面上传 —— 读图 → 等比缩到 480px 宽 → JPEG dataURL 存书架条目 */
  const handleCoverFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 480;
        const scale = Math.min(1, MAX_W / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCoverHint("封面处理失败");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setCustomCover(book.id, dataUrl);
          setCoverHint("封面已更新");
          onCoverChange?.();
        } catch {
          setCoverHint("封面保存失败（存储空间不足）");
        }
      };
      img.onerror = () => setCoverHint("图片读取失败");
      img.src = String(reader.result);
    };
    reader.onerror = () => setCoverHint("文件读取失败");
    reader.readAsDataURL(file);
  };

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

        {/* Phase 9B-2：自定义封面（上传 / URL / 恢复默认，仅作用本书） */}
        <button
          type="button"
          className={`br-focus-btn book-pressable ${coverOpen ? "is-active" : ""}`}
          onClick={() => setCoverOpen(v => !v)}
        >
          <ImagePlus size={18} strokeWidth={1.9} />
          <span>更换封面</span>
        </button>
        {hasCustomCover && (
          <button
            type="button"
            className="br-focus-btn book-pressable"
            onClick={() => {
              setCustomCover(book.id, null);
              setCoverUrl("");
              setCoverHint("已恢复默认封面");
              onCoverChange?.();
            }}
          >
            <RotateCcw size={18} strokeWidth={1.9} />
            <span>恢复封面</span>
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleCoverFile(file);
            e.target.value = "";
          }}
        />

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

      {coverOpen && (
        <section className="br-sheet-section br-focus-sub-list">
          <button
            type="button"
            className="br-focus-sub-row book-pressable"
            onClick={() => coverInputRef.current?.click()}
          >
            <ImagePlus size={15} strokeWidth={1.9} />
            <span>上传本地图片</span>
          </button>
          <div className="br-cover-url-row">
            <input
              type="url"
              className="br-cover-url-input"
              placeholder="粘贴封面图片链接"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value.trim())}
              aria-label="封面图片链接"
            />
            <button
              type="button"
              className="br-cover-url-save book-pressable"
              disabled={!coverUrl}
              onClick={() => {
                if (/^(https?:|data:image)/i.test(coverUrl)) {
                  setCustomCover(book.id, coverUrl);
                  setCoverHint("封面已更新");
                  setCoverOpen(false);
                  onCoverChange?.();
                } else {
                  setCoverHint("请输入 http(s) 图片链接");
                }
              }}
            >
              使用
            </button>
          </div>
          <p className="br-focus-cover-note">自定义封面仅作用于《{book.title}》，不会影响其他书。</p>
        </section>
      )}

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
      {coverHint && <p className="br-sheet-hint">{coverHint}</p>}
    </BottomSheet>
  );
}
