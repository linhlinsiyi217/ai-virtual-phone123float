"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, Loader2, Upload } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { BottomSheet } from "./bookroom-ui";
import {
  detectImportFormat,
  LARGE_FILE_BYTES,
  parseImportedFile,
  ScanningPdfError,
  type ImportFormat,
  type ImportProgress,
} from "@/lib/bookroom-import-flow";
import {
  findImportedDuplicate,
  saveImportedBook,
} from "@/lib/bookroom-import";

type Props = {
  onClose: () => void;
  /** 导入成功并已保存后回调（书架刷新 / 可选自动打开） */
  onImported: (book: Book) => void;
};

const PROGRESS_TEXT: Record<ImportProgress, string> = {
  reading: "正在读取文件…",
  parsing: "正在解析内容…",
  splitting: "正在拆分章节…",
  saving: "正在保存…",
  done: "导入完成",
  failed: "导入失败",
};

const FORMAT_LABEL: Record<ImportFormat, string> = {
  txt: "TXT",
  epub: "EPUB",
  pdf: "PDF",
};

type DupState = { file: File; format: ImportFormat; matching: Book };

/**
 * 导入书籍半弹窗（Phase 4B）。
 * 本机文件选择 → 格式识别 → 去重检测 → 解析 → 保存 → 回调刷新书架。
 * 真实进度文案，无假进度条；扫描型 PDF / 损坏文件 / 空文件等明确提示，不崩溃。
 */
export function ImportSheet({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [dup, setDup] = useState<DupState | null>(null);
  const [doneBook, setDoneBook] = useState<Book | null>(null);
  const [lastFormat, setLastFormat] = useState<ImportFormat | null>(null);

  const busy = progress === "reading" || progress === "parsing" || progress === "splitting" || progress === "saving";

  const resetState = () => {
    setProgress(null);
    setError(null);
    setWarn(null);
    setDup(null);
    setDoneBook(null);
  };

  const runImport = async (file: File, format: ImportFormat) => {
    resetState();
    setLastFormat(format);
    if (file.size > LARGE_FILE_BYTES) {
      setWarn("文件较大，解析可能较慢，请稍候。");
    }
    try {
      const { book, chapters } = await parseImportedFile(file, format, stage => {
        setProgress(stage);
      });
      setProgress("saving");
      try {
        saveImportedBook(book, chapters);
      } catch {
        setError("存储空间不足，无法保存导入内容。");
        setProgress("failed");
        return;
      }
      setProgress("done");
      setDoneBook(book);
      // 短暂展示完成态后回调（让用户看到成功）
      window.setTimeout(() => {
        onImported(book);
      }, 600);
    } catch (err) {
      if (err instanceof ScanningPdfError) {
        setError("这是扫描型 PDF，当前暂不支持文字提取。");
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("导入失败，请重试。");
      }
      setProgress("failed");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    resetState();

    const format = detectImportFormat(file);
    if (!format) {
      setError("不支持的文件格式，仅支持 TXT / EPUB / PDF。");
      setProgress("failed");
      return;
    }

    // 去重检测（按文件名 + 大小，无需先解析）
    const matching = findImportedDuplicate(file.name, file.size);
    if (matching) {
      setDup({ file, format, matching });
      return;
    }
    runImport(file, format);
  };

  const handlePick = () => {
    if (busy || doneBook) return;
    inputRef.current?.click();
  };

  return (
    <BottomSheet title="导入书籍" onClose={onClose} panelClassName="br-sheet-tall">
      <section className="br-sheet-section br-import-section">
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.epub,.pdf,text/plain,application/epub+zip,application/pdf"
          className="br-import-input"
          onChange={handleFileChange}
          aria-label="选择书籍文件"
        />

        {/* 选择文件按钮 */}
        {!progress && !dup && (
          <button
            type="button"
            className="br-import-pick book-pressable"
            onClick={handlePick}
          >
            <Upload size={20} strokeWidth={1.9} />
            <span className="br-import-pick-title">选择本机文件</span>
            <span className="br-import-pick-sub">支持 TXT / EPUB / PDF</span>
          </button>
        )}

        {/* 大文件提示 */}
        {warn && !error && (
          <p className="br-import-warn">
            <AlertTriangle size={13} strokeWidth={2} />
            {warn}
          </p>
        )}

        {/* 进度 */}
        {progress && (busy || progress === "done") && (
          <div className="br-import-progress">
            {progress === "done" ? (
              <Check size={18} strokeWidth={2.4} className="br-import-done-icon" />
            ) : (
              <Loader2 size={18} strokeWidth={2} className="br-spin" />
            )}
            <span className="br-import-progress-text">{PROGRESS_TEXT[progress]}</span>
            {lastFormat && progress !== "done" && (
              <span className="br-import-progress-fmt">{FORMAT_LABEL[lastFormat]}</span>
            )}
          </div>
        )}

        {/* 完成态 */}
        {progress === "done" && doneBook && (
          <div className="br-import-done">
            <span className="br-import-done-title">{doneBook.title}</span>
            <span className="br-import-done-sub">
              {doneBook.importInfo && FORMAT_LABEL[doneBook.importInfo.format]}
              {doneBook.author ? ` · ${doneBook.author}` : ""}
            </span>
          </div>
        )}

        {/* 去重确认 */}
        {dup && (
          <div className="br-import-dup">
            <AlertTriangle size={16} strokeWidth={2} className="br-import-dup-icon" />
            <p className="br-import-dup-text">
              这本书似乎已经导入过《{dup.matching.title}》。
            </p>
            <div className="br-import-dup-actions">
              <button
                type="button"
                className="br-sheet-primary book-pressable"
                onClick={() => runImport(dup.file, dup.format)}
              >
                仍然导入副本
              </button>
              <button
                type="button"
                className="br-quiet-btn book-pressable"
                onClick={() => {
                  setDup(null);
                  onClose();
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="br-import-error">
            <AlertTriangle size={15} strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}

        {/* 失败后允许重试 */}
        {progress === "failed" && !dup && (
          <button
            type="button"
            className="br-sheet-primary book-pressable"
            onClick={handlePick}
          >
            重新选择文件
          </button>
        )}
      </section>

      <p className="br-import-foot">
        <FileUp size={12} strokeWidth={1.8} />
        导入内容仅保存在本机，不会上传，也不会写入长期记忆。
      </p>
    </BottomSheet>
  );
}
