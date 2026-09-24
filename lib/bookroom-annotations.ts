/**
 * 书房阅读器 — 用户标注持久化（Phase 3B）。
 *
 * 数据隔离（硬要求）：
 *   - 标注是「用户的阅读数据」，只存 kv-db，键前缀 bookroom-annotations:；
 *   - 不进入长期 AI 记忆、不进入共读会话；
 *   - 与阅读进度（bookroom-reading-progress:）完全分开。
 *
 * 标注通过 quote（+ 段落内 offset）与正文绑定；恢复时若正文文本变动导致
 * quote 找不到，则跳过该条装饰（不报错、不破坏排版）。
 */
import { kvGet, kvRemove, kvSet } from "./kv-db";

export type ReaderAnnotationColor = "blue" | "yellow" | "red" | "green";

export type ReaderAnnotationType = "underline" | "highlight" | "note";

export type ReaderAnnotation = {
  id: string;
  bookId: string;
  chapterIndex: number;
  /** 所在段落下标；标题等非正文区域为 -1 */
  paragraphIndex: number;
  type: ReaderAnnotationType;
  /** 选中的原文 */
  quote: string;
  /** 相对段落纯文本的起止偏移（用于精确定位 / 重复 quote 消歧） */
  startOffset?: number;
  endOffset?: number;
  /** 笔记内容（note 类型或给划线/高亮附加笔记时使用） */
  note?: string;
  color?: ReaderAnnotationColor;
  createdAt: number;
  updatedAt?: number;
};

const KEY_PREFIX = "bookroom-annotations:v1:";

function storageKey(bookId: string): string {
  return `${KEY_PREFIX}${bookId}`;
}

function sortAnnotations(list: ReaderAnnotation[]): ReaderAnnotation[] {
  return [...list].sort((a, b) => {
    if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex;
    if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex;
    return (a.startOffset ?? 0) - (b.startOffset ?? 0);
  });
}

/** 读取某本书的全部标注（章节/段落升序）；损坏数据返回空数组 */
export function loadBookAnnotations(bookId: string): ReaderAnnotation[] {
  const raw = kvGet(storageKey(bookId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortAnnotations(parsed.filter((item): item is ReaderAnnotation =>
      !!item
      && typeof item === "object"
      && typeof (item as ReaderAnnotation).id === "string"
      && typeof (item as ReaderAnnotation).bookId === "string"
      && typeof (item as ReaderAnnotation).quote === "string"
      && ["underline", "highlight", "note"].includes((item as ReaderAnnotation).type),
    ));
  } catch {
    return [];
  }
}

function persist(bookId: string, list: ReaderAnnotation[]): void {
  kvSet(storageKey(bookId), JSON.stringify(sortAnnotations(list)));
}

function makeId(): string {
  return `ran_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type NewAnnotationInput = Omit<ReaderAnnotation, "id" | "createdAt" | "updatedAt"> & { id?: string };

/** 新建或按 id 覆盖更新一条标注，返回保存后的最新列表 */
export function saveBookAnnotation(bookId: string, input: NewAnnotationInput): { annotation: ReaderAnnotation; list: ReaderAnnotation[] } {
  const list = loadBookAnnotations(bookId);
  const now = Date.now();
  if (input.id) {
    const index = list.findIndex(item => item.id === input.id);
    if (index >= 0) {
      const updated: ReaderAnnotation = { ...list[index], ...input, id: input.id, updatedAt: now };
      list[index] = updated;
      persist(bookId, list);
      return { annotation: updated, list: sortAnnotations(list) };
    }
  }
  const annotation: ReaderAnnotation = { ...input, id: input.id ?? makeId(), createdAt: now };
  list.push(annotation);
  persist(bookId, list);
  return { annotation, list: sortAnnotations(list) };
}

/** 删除一条标注，返回最新列表 */
export function deleteBookAnnotation(bookId: string, annotationId: string): ReaderAnnotation[] {
  const list = loadBookAnnotations(bookId).filter(item => item.id === annotationId);
  persist(bookId, list);
  return sortAnnotations(list);
}

/** Phase 4B：清除某本书的全部标注（删除导入书时清理） */
export function clearBookAnnotations(bookId: string): void {
  kvRemove(storageKey(bookId));
}

/* ───────────────────────── 渲染期：段落装饰切分 ───────────────────────── */

export type ParagraphDecoration = {
  start: number;
  end: number;
  annotation: ReaderAnnotation;
};

/**
 * 计算某段正文内可渲染的标注区间：
 * - 优先用 offset 校验；offset 失效则回退 indexOf(quote)；
 * - 区间重叠时只保留靠前的一条，避免嵌套样式；
 * - 找不到原文的标注被跳过（正文变化时静默降级）。
 */
export function resolveParagraphDecorations(text: string, annotations: ReaderAnnotation[]): ParagraphDecoration[] {
  const found: ParagraphDecoration[] = [];
  for (const annotation of annotations) {
    const quote = annotation.quote ?? "";
    if (!quote) continue;
    let start = -1;
    if (
      typeof annotation.startOffset === "number"
      && typeof annotation.endOffset === "number"
      && annotation.startOffset >= 0
      && annotation.endOffset <= text.length
      && text.slice(annotation.startOffset, annotation.endOffset) === quote
    ) {
      start = annotation.startOffset;
    } else {
      start = text.indexOf(quote);
    }
    if (start < 0) continue;
    found.push({ start, end: start + quote.length, annotation });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: ParagraphDecoration[] = [];
  let cursor = 0;
  for (const item of found) {
    if (item.start < cursor) continue; // 与已选区重叠，丢弃
    result.push(item);
    cursor = item.end;
  }
  return result;
}
