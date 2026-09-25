"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, ChevronLeft, ChevronRight, MoonStar } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { loadReadingProgress, saveReadingProgress, getOverallPercent } from "@/lib/reading-progress";
import { markFinished, markReading } from "@/lib/bookroom-shelf";
import { noteCoSessionProgress } from "@/lib/bookroom-sessions";
import {
  loadBookAnnotations,
  saveBookAnnotation,
  deleteBookAnnotation,
  resolveParagraphDecorations,
  type ReaderAnnotation,
  type ReaderAnnotationColor,
  type ReaderAnnotationType,
} from "@/lib/bookroom-annotations";
import { loadCompanionId } from "@/lib/bookroom-shelf";
import { isRealCompanionRole, resolveCompanionRoles, type CompanionRole } from "@/lib/bookroom-mock";
import {
  createBookTts,
  isBookTtsSupported,
  type BookTtsController,
  type BookTtsStatus,
} from "@/lib/bookroom-tts";
import { BrToast } from "./bookroom-ui";
import { getActiveReadingSkin, buildSkinCss } from "@/lib/bookroom-reading-skins";
import {
  loadReaderPrefs,
  saveBookReaderPrefs,
  buildReaderPrefsCssVars,
  resolveReaderColors,
  buildReaderTexture,
  READER_PREFS_EVENT,
  type ReaderPrefs,
} from "@/lib/bookroom-reader-prefs";
import {
  playAmbient,
  stopAmbient,
  setAmbientVolume,
  getAmbientId,
  setSleepTimer,
  clearSleepTimer,
  SLEEP_TIMER_EVENT,
} from "@/lib/bookroom-audio";
import {
  ReaderSelectionMenu,
  type ReaderMenuAction,
  type ReaderSelectionRect,
} from "./reader-selection-menu";
import {
  ReaderAnnotationsSheet,
  ReaderMarkManageSheet,
  ReaderNoteSheet,
  ReaderSearchSheet,
  ReaderTtsSheet,
  ReaderTranslateSheet,
} from "./reader-tool-sheets";

type Props = {
  book: Book;
  /** 返回：回到书籍详情（不退出书房） */
  onBack: () => void;
  /** 打开夜读工具半弹窗 */
  onOpenNight: () => void;
  /** 划词「问 TA」：把含选中原文的问题带入共读聊天层 */
  onAskRole: (askText: string) => void;
  /** 划词「AI 写作」：把选中原文带入书桌快速新建（Phase 9A） */
  onAiWrite?: (idea: string) => void;
  /** Phase 9A：阅读页右上角统一角色共读入口（视觉与主页一致） */
  companion?: CompanionRole;
  onOpenCoRead?: () => void;
};

type TextSelectionInfo = {
  quote: string;
  startPara: number;
  endPara: number;
  startOffset: number;
  endOffset: number;
  rect: ReaderSelectionRect;
};

type ActiveSheet =
  | {
    kind: "note";
    annotation?: ReaderAnnotation;
    quote: string;
    paragraphIndex: number;
    startOffset?: number;
    endOffset?: number;
  }
  | { kind: "translate"; quote: string }
  | { kind: "search"; query: string }
  | { kind: "annotations" }
  | { kind: "manage"; annotation: ReaderAnnotation }
  | { kind: "tts" }
  | null;

/** 计算选区端点在段落纯文本中的偏移（段落内有标注 span 也能正确换算） */
function getTextOffset(root: HTMLElement, node: Node, offset: number): number {
  if (node === root) {
    let total = 0;
    for (let i = 0; i < offset && i < root.childNodes.length; i += 1) {
      total += root.childNodes[i].textContent?.length ?? 0;
    }
    return total;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 剪贴板权限/非安全上下文降级
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * 普通书文字阅读器 — 纵向连续滚动。
 * Phase 3B 起：正文原生可选，长按/划词浮出上下文工具（复制/划线/笔记/问TA/
 * 翻译/高亮/搜索/从此听）；标注走独立 kv-db，与进度/共读/长期记忆隔离。
 */
export function ReadingView({ book, onBack, onOpenNight, onAskRole, onAiWrite, companion, onOpenCoRead }: Props) {
  const chapters = book.chapters ?? [];
  const total = chapters.length;

  const [chapterIndex, setChapterIndex] = useState<number>(() => {
    const saved = loadReadingProgress(book.id);
    if (saved && saved.chapterIndex >= 0 && saved.chapterIndex < total) {
      return saved.chapterIndex;
    }
    return 0;
  });
  const [scrollPercent, setScrollPercent] = useState(0);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>(() => loadBookAnnotations(book.id));
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ p: number; nonce: number } | null>(null);
  const [ttsStatus, setTtsStatus] = useState<BookTtsStatus>("idle");
  const [ttsIndex, setTtsIndex] = useState(-1);
  const [ttsRate, setTtsRate] = useState(1);
  // Phase 9A P1：阅读外观偏好（内置默认 ← 全局 ← 单本书），夜读 sheet 改动即时生效
  const [readerPrefs, setReaderPrefs] = useState<ReaderPrefs>(() => loadReaderPrefs(book.id));
  // Phase 8B：安静阅读 —— 顶 / 底栏默认隐藏，单击正文空白处切换
  const [chromeVisible, setChromeVisible] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const pendingJumpRef = useRef<number | null>(null);
  const stateRef = useRef({ chapterIndex, fraction: 0 });
  const sheetRef = useRef<ActiveSheet>(null);
  const toastTimerRef = useRef<number | null>(null);
  stateRef.current.chapterIndex = chapterIndex;
  sheetRef.current = sheet;

  const roleId = useMemo(() => loadCompanionId() ?? resolveCompanionRoles()[0]?.id ?? "", []);
  const roleReady = roleId ? isRealCompanionRole(roleId) : false;
  const ttsSupported = useMemo(() => isBookTtsSupported(), []);
  const ttsRef = useRef<BookTtsController | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  const persist = useCallback((index: number, fraction: number) => {
    const clamped = Math.min(1, Math.max(0, fraction));
    saveReadingProgress({ bookId: book.id, chapterIndex: index, scrollProgress: clamped });
    const overall = getOverallPercent(book, { bookId: book.id, chapterIndex: index, scrollProgress: clamped });
    // 完成判定：最后一章且滚动接近底部 → 标记已读
    if (overall >= 100) {
      markFinished(book.id);
    }
    // 共读会话联动：章节变化 / 进度推进同步到当前陪读角色的进行中会话（内部节流）
    noteCoSessionProgress(loadCompanionId() ?? "", book.id, {
      chapterIndex: index,
      progress: overall,
    });
  }, [book]);

  /* 打开阅读器：标记为阅读中 */
  useEffect(() => {
    markReading(book.id);
  }, [book.id]);

  /* ── 阅读皮肤：注入 CSS 变量 ── */
  useEffect(() => {
    const skin = getActiveReadingSkin();
    const styleId = "br-reading-skin-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = skin ? buildSkinCss(skin) : "";
    return () => {
      if (styleEl) styleEl.textContent = "";
    };
  }, [book.id]);

  /* ── Phase 9A P1：阅读外观偏好 ──
     挂载时恢复环境音 / 睡眠定时；监听 sheet 保存事件即时应用；
     睡眠定时到点：停 TTS + 环境音（audio 层已停）并清零偏好。 */
  useEffect(() => {
    const initial = loadReaderPrefs(book.id);
    setReaderPrefs(initial);
    if (initial.ambientId !== "off") playAmbient(initial.ambientId, initial.ambientVolume / 100);
    if (initial.sleepTimer > 0) setSleepTimer(initial.sleepTimer);

    const onPrefsChanged = () => {
      const next = loadReaderPrefs(book.id);
      setReaderPrefs(prev => {
        // 环境音播放状态与偏好对齐（偏好可能在 sheet 中改但播放已由 sheet 侧处理）
        if (next.ambientId !== getAmbientId()) {
          if (next.ambientId === "off") stopAmbient();
          else playAmbient(next.ambientId, next.ambientVolume / 100);
        } else if (next.ambientId !== "off" && next.ambientVolume !== prev.ambientVolume) {
          setAmbientVolume(next.ambientVolume / 100);
        }
        if (next.ttsVolume !== prev.ttsVolume) ttsRef.current?.setVolume(next.ttsVolume / 100);
        return next;
      });
    };
    const onSleepFired = () => {
      ttsRef.current?.stop();
      setReaderPrefs(current => {
        const next = { ...current, sleepTimer: 0 };
        saveBookReaderPrefs(book.id, next);
        return next;
      });
      showToast("睡眠定时已到，已停止朗读与环境音");
    };
    window.addEventListener(READER_PREFS_EVENT, onPrefsChanged);
    window.addEventListener(SLEEP_TIMER_EVENT, onSleepFired);
    return () => {
      window.removeEventListener(READER_PREFS_EVENT, onPrefsChanged);
      window.removeEventListener(SLEEP_TIMER_EVENT, onSleepFired);
      stopAmbient();
      clearSleepTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  /* ── 进度：离开 / 切后台落盘 ── */
  useEffect(() => {
    const flush = () => persist(stateRef.current.chapterIndex, stateRef.current.fraction);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  /* ── 章节切换：恢复滚动位置并保存当前章节 ── */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const saved = loadReadingProgress(book.id);
    const target = saved && saved.chapterIndex === chapterIndex ? saved.scrollProgress : 0;
    restoringRef.current = true;
    const raf = requestAnimationFrame(() => {
      const max = container.scrollHeight - container.clientHeight;
      container.scrollTop = max > 0 ? target * max : 0;
      setScrollPercent(Math.round(target * 100));
      stateRef.current.fraction = target;
      requestAnimationFrame(() => { restoringRef.current = false; });
    });
    persist(chapterIndex, target);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIndex, book.id]);

  /* ── 跨章跳转：章节渲染完成后定位到目标段落并闪动提示 ── */
  useEffect(() => {
    const target = pendingJumpRef.current;
    if (target === null) return;
    pendingJumpRef.current = null;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = articleRef.current?.querySelector<HTMLElement>(`[data-pindex="${target}"]`);
      el?.scrollIntoView({ block: "center" });
      setFlash({ p: target, nonce: Date.now() });
    }));
    return () => cancelAnimationFrame(raf);
  }, [chapterIndex]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 1700);
    return () => window.clearTimeout(timer);
  }, [flash]);

  /** 单击正文空白：切换安静模式工具栏；正在划词 / 点标注 / 工具条还在时不切换 */
  const handleContentTap = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;
    // 选区刚收起但浮条仍在（selectionchange 尚未触发）：只关浮条，不切换 chrome
    if (selection) {
      setSelection(null);
      return;
    }
    setChromeVisible(v => !v);
  };

  const handleScroll = () => {
    setSelection(null);
    if (restoringRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const max = container.scrollHeight - container.clientHeight;
      const fraction = max > 0 ? container.scrollTop / max : 0;
      stateRef.current.fraction = fraction;
      setScrollPercent(Math.round(fraction * 100));
      persist(chapterIndex, fraction);
    });
  };

  /* ── 划词捕获：原生 selectionchange（鼠标/触摸通用），rAF 去抖 ── */
  const captureSelection = useCallback(() => {
    if (sheetRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const article = articleRef.current;
    if (!article || !article.contains(range.startContainer)) return;

    const closestPara = (node: Node | null): HTMLElement | null => {
      const element = node && node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement ?? null;
      const para = element?.closest?.(".reading-body-paragraph") as HTMLElement | null;
      return para && article.contains(para) ? para : null;
    };
    const startParaEl = closestPara(range.startContainer);
    const endParaEl = closestPara(range.endContainer);
    if (!startParaEl || !endParaEl) {
      setSelection(null);
      return;
    }
    const quote = sel.toString().trim();
    if (!quote) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelection(null);
      return;
    }
    const startPara = Number(startParaEl.dataset.pindex);
    const endPara = Number(endParaEl.dataset.pindex);
    let startOffset = 0;
    let endOffset = 0;
    if (startPara === endPara) {
      startOffset = getTextOffset(startParaEl, range.startContainer, range.startOffset);
      endOffset = getTextOffset(startParaEl, range.endContainer, range.endOffset);
      if (startOffset > endOffset) {
        [startOffset, endOffset] = [endOffset, startOffset];
      }
    }
    setSelection({
      quote,
      startPara,
      endPara,
      startOffset,
      endOffset,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  }, []);

  useEffect(() => {
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(captureSelection);
    };
    document.addEventListener("selectionchange", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      cancelAnimationFrame(raf);
    };
  }, [captureSelection]);

  /* ── Phase 9A：正文区拦截浏览器 / WebView 原生长按菜单 ──
     只作用于阅读内容根节点，不影响其它页面输入框的系统菜单 */
  useEffect(() => {
    const article = articleRef.current;
    const scroller = scrollRef.current;
    const prevent = (event: Event) => {
      event.preventDefault();
    };
    article?.addEventListener("contextmenu", prevent, true);
    scroller?.addEventListener("contextmenu", prevent, true);
    return () => {
      article?.removeEventListener("contextmenu", prevent, true);
      scroller?.removeEventListener("contextmenu", prevent, true);
    };
  }, [chapterIndex]);

  /* ── TTS 控制器（浏览器 SpeechSynthesis），卸载即停 ── */
  useEffect(() => {
    if (!ttsSupported) return;
    const controller = createBookTts({
      onIndex: index => {
        setTtsIndex(index);
        requestAnimationFrame(() => {
          articleRef.current
            ?.querySelector<HTMLElement>(`[data-pindex="${index}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      },
      onStatus: setTtsStatus,
      onEnd: () => {
        showToast("本章朗读完毕");
        setSheet(current => (current?.kind === "tts" ? null : current));
      },
      onError: message => showToast(message),
    }, { volume: loadReaderPrefs(book.id).ttsVolume / 100 });
    ttsRef.current = controller;
    return () => controller.stop();
  }, [ttsSupported, showToast, book.id]);

  /* 切章即停：朗读队列按本章段落建立，避免索引串到新章节 */
  useEffect(() => {
    ttsRef.current?.stop();
    setTtsIndex(-1);
  }, [chapterIndex]);

  const goChapter = (next: number) => {
    if (next < 0 || next >= total || next === chapterIndex) return;
    persist(chapterIndex, stateRef.current.fraction);
    setChapterIndex(next);
  };

  const collapseSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const openSheet = (next: ActiveSheet) => {
    collapseSelection();
    setSheet(next);
  };

  const jumpToParagraph = useCallback((chapterIdx: number, paragraphIdx: number) => {
    setSheet(null);
    if (chapterIdx !== stateRef.current.chapterIndex) {
      pendingJumpRef.current = paragraphIdx;
      persist(stateRef.current.chapterIndex, stateRef.current.fraction);
      setChapterIndex(chapterIdx);
    } else {
      requestAnimationFrame(() => {
        const el = articleRef.current?.querySelector<HTMLElement>(`[data-pindex="${paragraphIdx}"]`);
        el?.scrollIntoView({ block: "center" });
        setFlash({ p: paragraphIdx, nonce: Date.now() });
      });
    }
  }, [persist]);

  const createMark = (type: ReaderAnnotationType, color: ReaderAnnotationColor, info: TextSelectionInfo) => {
    const { list } = saveBookAnnotation(book.id, {
      bookId: book.id,
      chapterIndex,
      paragraphIndex: info.startPara,
      type,
      quote: info.quote,
      startOffset: info.startOffset,
      endOffset: info.endOffset,
      color,
    });
    setAnnotations(list);
  };

  const startListen = (info: TextSelectionInfo) => {
    if (!ttsSupported) {
      showToast("当前设备不支持朗读");
      collapseSelection();
      return;
    }
    ttsRef.current?.start(chapter?.content ?? [], info.startPara, info.startOffset);
    setSheet({ kind: "tts" });
    collapseSelection();
  };

  const handleMenuAction = (action: ReaderMenuAction) => {
    const info = selection;
    if (!info) return;
    const single = info.startPara === info.endPara;
    switch (action) {
      case "copy":
        void copyToClipboard(info.quote).then(ok => showToast(ok ? "已复制" : "复制失败，请长按手动选择复制"));
        collapseSelection();
        break;
      case "underline":
        if (!single) { showToast("请在同一段落内选择"); return; }
        createMark("underline", "blue", info);
        collapseSelection();
        showToast("已划线");
        break;
      case "highlight":
        if (!single) { showToast("请在同一段落内选择"); return; }
        createMark("highlight", "yellow", info);
        collapseSelection();
        showToast("已高亮");
        break;
      case "note":
        if (!single) { showToast("请在同一段落内选择"); return; }
        openSheet({
          kind: "note",
          quote: info.quote,
          paragraphIndex: info.startPara,
          startOffset: info.startOffset,
          endOffset: info.endOffset,
        });
        break;
      case "ask":
        onAskRole(
          `我在读《${book.title}》，读到这一段想听听你：\n「${info.quote.length > 200 ? `${info.quote.slice(0, 200)}…` : info.quote}」\n你怎么看？`,
        );
        collapseSelection();
        break;
      case "translate":
        if (!roleReady) {
          showToast("先选择一位陪读角色");
          collapseSelection();
          return;
        }
        openSheet({ kind: "translate", quote: info.quote });
        break;
      case "search":
        openSheet({ kind: "search", query: info.quote });
        break;
      case "listen":
        startListen(info);
        break;
      /* ── Phase 9A 第三行动作 ── */
      case "favorite":
        if (!single) { showToast("请在同一段落内选择"); return; }
        createMark("favorite", "blue", info);
        collapseSelection();
        showToast("已收藏到语录");
        break;
      case "share": {
        const shareText = `「${info.quote}」\n——《${book.title}》`;
        const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
        if (typeof nav.share === "function") {
          nav.share({ text: shareText })
            .then(() => showToast("已分享"))
            .catch(() => undefined);
        } else {
          void copyToClipboard(shareText).then(ok => showToast(ok ? "已复制，可粘贴分享" : "分享失败"));
        }
        collapseSelection();
        break;
      }
      case "websearch": {
        const url = `https://www.bing.com/search?q=${encodeURIComponent(info.quote.slice(0, 80))}`;
        window.open(url, "_blank", "noopener,noreferrer");
        collapseSelection();
        break;
      }
      case "aiwrite":
        if (onAiWrite) {
          onAiWrite(info.quote.length > 200 ? `${info.quote.slice(0, 200)}…` : info.quote);
          collapseSelection();
        } else {
          showToast("请先到书桌使用 AI 写作");
          collapseSelection();
        }
        break;
      default:
        break;
    }
  };

  /* ── 标注点击：选区折叠时才打开管理，避免与划词冲突 ── */
  const openManage = (annotation: ReaderAnnotation) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    setSheet({ kind: "manage", annotation });
  };

  const openNoteFor = (annotation: ReaderAnnotation) => {
    setSheet({
      kind: "note",
      annotation,
      quote: annotation.quote,
      paragraphIndex: annotation.paragraphIndex,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
    });
  };

  const refreshAnnotations = () => setAnnotations(loadBookAnnotations(book.id));

  const saveNote = (note: string) => {
    if (sheet?.kind !== "note") return;
    if (sheet.annotation) {
      saveBookAnnotation(book.id, { ...sheet.annotation, note });
    } else {
      saveBookAnnotation(book.id, {
        bookId: book.id,
        chapterIndex,
        paragraphIndex: sheet.paragraphIndex,
        type: "note",
        quote: sheet.quote,
        startOffset: sheet.startOffset,
        endOffset: sheet.endOffset,
        color: "yellow",
        note,
      });
    }
    refreshAnnotations();
    setSheet(null);
    showToast("笔记已保存");
  };

  const deleteNote = () => {
    if (sheet?.kind !== "note" || !sheet.annotation) return;
    setAnnotations(deleteBookAnnotation(book.id, sheet.annotation.id));
    setSheet(null);
    showToast("笔记已删除");
  };

  const changeMarkColor = (color: ReaderAnnotationColor) => {
    if (sheet?.kind !== "manage") return;
    saveBookAnnotation(book.id, { ...sheet.annotation, color });
    refreshAnnotations();
    setSheet(null);
    showToast("已换颜色");
  };

  const deleteMark = () => {
    if (sheet?.kind !== "manage") return;
    setAnnotations(deleteBookAnnotation(book.id, sheet.annotation.id));
    setSheet(null);
    showToast("已删除");
  };

  const deleteFromList = (annotation: ReaderAnnotation) => {
    setAnnotations(deleteBookAnnotation(book.id, annotation.id));
    showToast("已删除");
  };

  const renderParagraph = (text: string, pIndex: number): ReactNode => {
    const decos = resolveParagraphDecorations(
      text,
      annotations.filter(item => item.chapterIndex === chapterIndex && item.paragraphIndex === pIndex),
    );
    if (decos.length === 0) return text;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    decos.forEach(deco => {
      if (deco.start > cursor) nodes.push(text.slice(cursor, deco.start));
      const ann = deco.annotation;
      nodes.push(
        <span
          key={ann.id}
          className={`ra-mark ra-${ann.type}`}
          data-color={ann.color ?? (ann.type === "underline" || ann.type === "favorite" ? "blue" : "yellow")}
          onClick={event => {
            event.stopPropagation();
            openManage(ann);
          }}
        >
          {text.slice(deco.start, deco.end)}
          {ann.note ? (
            <span
              className="ra-note-flag"
              role="button"
              aria-label="查看笔记"
              onClick={event => {
                event.stopPropagation();
                openNoteFor(ann);
              }}
            >
              注
            </span>
          ) : null}
        </span>,
      );
      cursor = deco.end;
    });
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
  };

  const chapter = chapters[chapterIndex];
  const canPrev = chapterIndex > 0;
  const canNext = chapterIndex < total - 1;

  const activeSkin = getActiveReadingSkin();
  const skinVars: React.CSSProperties = activeSkin
    ? {
        "--reader-font-family": activeSkin.typography.fontFamily,
        "--reader-font-size": `${activeSkin.typography.fontSize}px`,
        "--reader-font-weight": activeSkin.typography.fontWeight,
        "--reader-letter-spacing": `${activeSkin.typography.letterSpacing}px`,
        "--reader-line-height": activeSkin.typography.lineHeight,
        "--reader-paragraph-spacing": `${activeSkin.typography.paragraphSpacing}em`,
        "--reader-padding-x": `${activeSkin.typography.paddingHorizontal}px`,
        "--reader-text-width": `${activeSkin.typography.textWidth}%`,
        "--reader-text-align": activeSkin.typography.textAlign,
      } as React.CSSProperties
    : {};

  // Phase 9A P1：阅读外观偏好覆盖在皮肤之上（主调节面板），含纸底背景 / 正文色 / 纹理 / 翻页动效
  const prefsVars = buildReaderPrefsCssVars(readerPrefs) as React.CSSProperties;
  const readerColors = resolveReaderColors(readerPrefs);
  const readerTexture = buildReaderTexture(readerPrefs.textureStrength);
  const rootStyle: React.CSSProperties = {
    ...skinVars,
    ...prefsVars,
    background: readerColors.bg,
  };

  return (
    <div
      className={`reading-view br-page bookroom-reader-skin-root reader-motion-${readerPrefs.pageMotion}${readerTexture ? " has-texture" : ""}${readerColors.dark ? " is-dark-paper" : ""}`}
      style={rootStyle}
    >
      {readerTexture && (
        <div
          className="br-reader-texture"
          aria-hidden
          style={{ backgroundImage: readerTexture.backgroundImage, opacity: readerTexture.opacity }}
        />
      )}
      <header className={`reading-header${chromeVisible ? " is-chrome-visible" : " is-chrome-hidden"}`}>
        <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回书籍详情">
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <span className="reading-header-title">{book.title}</span>
        {companion && onOpenCoRead && (
          <button
            type="button"
            className="br-role-entry book-pressable reading-role-entry"
            onClick={onOpenCoRead}
            aria-label={`和 ${companion.name} 一起读`}
            title="角色共读"
          >
            <span className="br-role-entry-avatar">
              {companion.avatar ? <img src={companion.avatar} alt="" /> : companion.name.slice(0, 1)}
            </span>
            <span className={`br-role-dot br-role-dot-${companion.status}`} aria-hidden />
          </button>
        )}
        <button
          className="book-icon-btn book-pressable"
          type="button"
          aria-label="我的标注"
          onClick={() => setSheet({ kind: "annotations" })}
        >
          <Bookmark size={17} strokeWidth={2} />
        </button>
        <button
          className="book-icon-btn book-pressable"
          type="button"
          aria-label="夜读设置"
          onClick={onOpenNight}
        >
          <MoonStar size={17} strokeWidth={2} />
        </button>
      </header>

      <div
        className="reading-content"
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleContentTap}
      >
        <article
          className="reading-article"
          ref={articleRef}
          key={readerPrefs.pageMotion === "scroll" ? "static" : `ch-${chapterIndex}`}
        >
          <h2 className="reading-chapter-title">{chapter?.title ?? ""}</h2>
          {chapter?.content.map((paragraph, i) => (
            <p
              className={`reading-body-paragraph${flash?.p === i ? " ra-flash" : ""}${ttsIndex === i ? " is-speaking" : ""}`}
              key={i}
              data-pindex={i}
            >
              {renderParagraph(paragraph, i)}
            </p>
          ))}
          <div className="reading-chapter-end">
            {canNext ? "— 本章完 —" : "— 全书完 —"}
          </div>
        </article>
      </div>

      <footer
        className="reading-footer"
        style={{ background: `linear-gradient(180deg, transparent, ${readerColors.bg})` }}
      >
        <div className="reading-progress-bar">
          <div className="reading-progress-bar-fill" style={{ width: `${scrollPercent}%` }} />
        </div>
        <div className={`reading-footer-row${chromeVisible ? " is-chrome-visible" : " is-chrome-hidden"}`}>
          <button
            type="button"
            className="reading-nav-btn book-pressable"
            onClick={() => goChapter(chapterIndex - 1)}
            disabled={!canPrev}
            aria-label="上一章"
          >
            <ChevronLeft size={18} strokeWidth={2} />
            上一章
          </button>
          <span className="reading-footer-center">
            第 {total > 0 ? chapterIndex + 1 : 0} / {total} 章
            <span className="reading-footer-percent">{scrollPercent}%</span>
          </span>
          <button
            type="button"
            className="reading-nav-btn book-pressable"
            onClick={() => goChapter(chapterIndex + 1)}
            disabled={!canNext}
            aria-label="下一章"
          >
            下一章
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </div>
      </footer>

      {selection && !sheet && (
        <ReaderSelectionMenu
          rect={selection.rect}
          singleParagraph={selection.startPara === selection.endPara}
          onAction={handleMenuAction}
        />
      )}

      {sheet?.kind === "note" && (
        <ReaderNoteSheet
          quote={sheet.quote}
          initialNote={sheet.annotation?.note ?? ""}
          onSave={saveNote}
          onDelete={sheet.annotation ? deleteNote : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "translate" && (
        <ReaderTranslateSheet
          roleId={roleId}
          quote={sheet.quote}
          onCopy={copyToClipboard}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "search" && (
        <ReaderSearchSheet
          book={book}
          initialQuery={sheet.query}
          currentChapterIndex={chapterIndex}
          onJump={jumpToParagraph}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "annotations" && (
        <ReaderAnnotationsSheet
          book={book}
          annotations={annotations}
          onJump={annotation => jumpToParagraph(annotation.chapterIndex, Math.max(0, annotation.paragraphIndex))}
          onDelete={deleteFromList}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "manage" && (
        <ReaderMarkManageSheet
          annotation={sheet.annotation}
          onColor={changeMarkColor}
          onEditNote={() => openNoteFor(sheet.annotation)}
          onDelete={deleteMark}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "tts" && (
        <ReaderTtsSheet
          status={ttsStatus}
          paragraphIndex={ttsIndex}
          rate={ttsRate}
          onPause={() => ttsRef.current?.pause()}
          onResume={() => ttsRef.current?.resume()}
          onStop={() => {
            ttsRef.current?.stop();
            setSheet(null);
          }}
          onRateChange={rate => {
            setTtsRate(rate);
            ttsRef.current?.setRate(rate);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      <BrToast text={toast} />
    </div>
  );
}
