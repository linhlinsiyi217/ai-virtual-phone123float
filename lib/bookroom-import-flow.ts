/**
 * 书房 — 导入文件解析流程（Phase 4B）。
 *
 * 复用 lib/reading-parser.ts 的纯解析层（decodeTxtArrayBuffer / parseTxtContent /
 * parseEpubFile / inspectPdfFile / parsePdfPageRange），把其 ParsedChapter.paragraphs
 * 映射为 BookRoom 的 BookChapter.content: string[]。
 *
 * 本模块只负责「文件 → Book + BookChapter[]」的转换，不碰存储（存储走 bookroom-import.ts），
 * 不碰原文件（只读取 ArrayBuffer）。
 */
import {
  decodeTxtArrayBuffer,
  inspectPdfFile,
  parseEpubFile,
  parsePdfPageRange,
  parseTxtContent,
} from "./reading-parser";
import { makeImportedBookId } from "./bookroom-import";
import type { Book, BookChapter } from "./bookstore-data";

export type ImportFormat = "txt" | "epub" | "pdf";

/** 大文件软限制（>此值 UI 给提示但仍允许） */
export const LARGE_FILE_BYTES = 80 * 1024 * 1024;

/** 扫描型 PDF（无文本层）：不伪装已解析，UI 显示明确不支持提示 */
export class ScanningPdfError extends Error {
  constructor() {
    super("scanning-pdf");
    this.name = "ScanningPdfError";
  }
}

export type ImportProgress =
  | "reading"
  | "parsing"
  | "splitting"
  | "saving"
  | "done"
  | "failed";

export type ParsedImport = {
  book: Book;
  chapters: BookChapter[];
};

/** 按扩展名 + MIME 识别格式；不识别返回 null */
export function detectImportFormat(file: File): ImportFormat | null {
  const name = file.name.toLowerCase();
  const ext = (name.match(/\.([^.]+)$/) || [, ""])[1];
  if (ext === "txt" || file.type === "text/plain") return "txt";
  if (ext === "epub" || file.type === "application/epub+zip") return "epub";
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  return null;
}

function toBookChapters(parsed: { title: string; paragraphs: string[] }[]): BookChapter[] {
  return parsed.map((ch, i) => ({
    id: `ch-${i}`,
    title: ch.title,
    content: ch.paragraphs,
  }));
}

function buildBook(
  format: ImportFormat,
  title: string,
  author: string | undefined,
  coverDataUrl: string | undefined,
  file: File,
): Book {
  const coverTone = format === "epub" ? "blue" : format === "pdf" ? "ink" : "paper";
  return {
    id: makeImportedBookId(),
    title: title || file.name.replace(/\.[^.]+$/, "") || "未命名",
    author: author && author.trim() ? author.trim() : "未知作者",
    category: "导入",
    type: "book",
    description: "",
    coverTone,
    source: "imported",
    importInfo: {
      format,
      fileName: file.name,
      fileSize: file.size,
      importedAt: Date.now(),
    },
    coverUrl: coverDataUrl,
  };
}

/**
 * 解析导入文件为 Book + chapters。
 * onProgress 用于驱动真实状态文案（非假进度）。
 * 失败抛 Error（含友好 message）；扫描型 PDF 抛 ScanningPdfError。
 */
export async function parseImportedFile(
  file: File,
  format: ImportFormat,
  onProgress?: (stage: ImportProgress) => void,
): Promise<ParsedImport> {
  if (file.size === 0) {
    onProgress?.("failed");
    throw new Error("文件为空，无法导入。");
  }

  try {
    onProgress?.("reading");
    const buffer = await file.arrayBuffer();

    onProgress?.("parsing");
    if (format === "txt") {
      const { text } = decodeTxtArrayBuffer(buffer);
      if (!text.trim()) throw new Error("未能从文件中读取到文本。");
      onProgress?.("splitting");
      const parsed = parseTxtContent(text, file.name);
      const chapters = toBookChapters(parsed.chapters);
      if (chapters.length === 0) throw new Error("章节拆分为空，无法导入。");
      onProgress?.("done");
      return {
        book: buildBook("txt", parsed.title, undefined, undefined, file),
        chapters,
      };
    }

    if (format === "epub") {
      const parsed = await parseEpubFile(buffer, file.name);
      const chapters = toBookChapters(parsed.chapters);
      if (chapters.length === 0) throw new Error("EPUB 内未找到可读章节。");
      onProgress?.("done");
      return {
        book: buildBook("epub", parsed.title, parsed.author, parsed.coverDataUrl, file),
        chapters,
      };
    }

    // PDF
    const inspect = await inspectPdfFile(buffer, file.name);
    const totalPages = inspect.totalPages;
    if (!totalPages || totalPages === 0) throw new ScanningPdfError();

    // 先探测前 2 页是否有文本层，快速识别扫描型 PDF
    const probeEnd = Math.min(2, totalPages);
    const probe = await parsePdfPageRange(buffer, {
      startPage: 1,
      endPage: probeEnd,
      fileName: file.name,
    });
    const hasText = probe.chunks.some(c => c.paragraphs.length > 0);
    if (!hasText) {
      onProgress?.("failed");
      throw new ScanningPdfError();
    }

    onProgress?.("splitting");
    const full = await parsePdfPageRange(buffer, {
      startPage: 1,
      endPage: totalPages,
      fileName: file.name,
    });
    const chapters = toBookChapters(full.chunks);
    if (chapters.length === 0) throw new Error("PDF 文本提取为空，无法导入。");
    onProgress?.("done");
    return {
      book: buildBook("pdf", full.title, full.author, undefined, file),
      chapters,
    };
  } catch (err) {
    onProgress?.("failed");
    if (err instanceof ScanningPdfError) throw err;
    // EPUB 损坏 / 缺 spine 等已有 message
    if (err instanceof Error && err.message) {
      throw new Error(friendlyParseError(err.message, format));
    }
    throw new Error("解析失败，请检查文件是否损坏。");
  }
}

function friendlyParseError(message: string, format: ImportFormat): string {
  if (format === "epub") {
    if (/container\.xml|rootfile|missing OPF|Invalid EPUB/i.test(message)) {
      return "EPUB 文件损坏或格式不正确。";
    }
  }
  return message;
}
