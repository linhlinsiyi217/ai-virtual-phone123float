/**
 * 书房「阅读外观偏好」— Reading Appearance Studio 数据层（Phase 9A P1）。
 *
 * 三层合并：内置默认 ← 全局默认（「设为默认」）← 单本书覆盖。
 * 排版变量沿用 Phase 8A 阅读皮肤的 --reader-* 命名（作用域 .bookroom-reader-skin-root），
 * 在 ReadingView 中以内联变量形式注入，优先级高于全局皮肤（偏好是主调节面板，皮肤是进阶玩法）。
 */
import { kvGet, kvSet, kvRemove } from "./kv-db";
import type { AmbientId } from "./bookroom-audio";

const DEFAULT_KEY = "bookroom-reader-prefs:v1:default";
const BOOK_PREFIX = "bookroom-reader-prefs:v1:book:";

/** 偏好变更广播事件（保存任意一层后触发） */
export const READER_PREFS_EVENT = "bookroom:reader-prefs-changed";

export type ReaderPaperId = "cold-white" | "ivory" | "light-gray" | "mist-blue" | "night-gray";
export type ReaderPageMotion = "scroll" | "fade" | "flip";
export type ReaderFontFamily = "system" | "serif" | "sans";

export type ReaderPrefs = {
  /** 背景明暗 40-100（100=纸面原色，向下压暗） */
  brightness: number;
  /** 正文字号 px */
  fontSize: number;
  /** 行距倍数 */
  lineHeight: number;
  /** 段距 em */
  paragraphSpacing: number;
  /** 页边距 px */
  paddingX: number;
  /** 正文宽度 % */
  textWidth: number;
  fontFamily: ReaderFontFamily;
  fontWeight: number;
  indentFirstLine: boolean;
  justify: boolean;
  paper: ReaderPaperId;
  /** 纸张纹理强度 0-100 */
  textureStrength: number;
  pageMotion: ReaderPageMotion;
  /* ── 夜读 ── */
  ttsEnabled: boolean;
  ambientId: AmbientId;
  /** 白噪音音量 0-100 */
  ambientVolume: number;
  /** TTS 音量 0-100（与环境音分离） */
  ttsVolume: number;
  /** 睡眠定时（分钟，0=关闭） */
  sleepTimer: number;
};

export const BUILTIN_READER_PREFS: ReaderPrefs = {
  brightness: 100,
  fontSize: 17,
  lineHeight: 1.9,
  paragraphSpacing: 1.2,
  paddingX: 24,
  textWidth: 100,
  fontFamily: "system",
  fontWeight: 420,
  indentFirstLine: false,
  justify: true,
  paper: "cold-white",
  textureStrength: 0,
  pageMotion: "scroll",
  ttsEnabled: false,
  ambientId: "off",
  ambientVolume: 50,
  ttsVolume: 80,
  sleepTimer: 0,
};

export const READER_PAPERS: Record<ReaderPaperId, { label: string; bg: string; text: string }> = {
  "cold-white": { label: "冷白纸", bg: "#FDFEFF", text: "#111318" },
  "ivory": { label: "米白纸", bg: "#F7F4EC", text: "#1C1B18" },
  "light-gray": { label: "浅灰纸", bg: "#EFF2F5", text: "#14161B" },
  "mist-blue": { label: "雾蓝纸", bg: "#EAF0F6", text: "#12161D" },
  "night-gray": { label: "夜间冷灰", bg: "#14171D", text: "#D9DFE7" },
};

const FONT_FAMILY_CSS: Record<ReaderFontFamily, string> = {
  system: "inherit",
  serif: '"Songti SC","STSong","Noto Serif SC",serif',
  sans: '"PingFang SC","Microsoft YaHei",sans-serif',
};

/* ── 工具 ── */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(hex: number): string {
  return clamp(Math.round(hex), 0, 255).toString(16).padStart(2, "0");
}

/** 两个 #RRGGBB 颜色按比例混合（t=0 全 a，t=1 全 b） */
function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => clampInt(v + (pb[i] - v) * t)).join("")}`;
}

function sanitize(raw: unknown): Partial<ReaderPrefs> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ReaderPrefs> = {};
  if (typeof r.brightness === "number") out.brightness = clamp(r.brightness, 40, 100);
  if (typeof r.fontSize === "number") out.fontSize = clamp(r.fontSize, 14, 24);
  if (typeof r.lineHeight === "number") out.lineHeight = clamp(r.lineHeight, 1.4, 2.6);
  if (typeof r.paragraphSpacing === "number") out.paragraphSpacing = clamp(r.paragraphSpacing, 0.4, 2.4);
  if (typeof r.paddingX === "number") out.paddingX = clamp(r.paddingX, 12, 48);
  if (typeof r.textWidth === "number") out.textWidth = clamp(r.textWidth, 78, 100);
  if (r.fontFamily === "system" || r.fontFamily === "serif" || r.fontFamily === "sans") out.fontFamily = r.fontFamily;
  if (typeof r.fontWeight === "number") out.fontWeight = clamp(r.fontWeight, 300, 700);
  if (typeof r.indentFirstLine === "boolean") out.indentFirstLine = r.indentFirstLine;
  if (typeof r.justify === "boolean") out.justify = r.justify;
  if (typeof r.paper === "string" && r.paper in READER_PAPERS) out.paper = r.paper as ReaderPaperId;
  if (typeof r.textureStrength === "number") out.textureStrength = clamp(r.textureStrength, 0, 100);
  if (r.pageMotion === "scroll" || r.pageMotion === "fade" || r.pageMotion === "flip") out.pageMotion = r.pageMotion;
  if (typeof r.ttsEnabled === "boolean") out.ttsEnabled = r.ttsEnabled;
  if (r.ambientId === "off" || r.ambientId === "rain" || r.ambientId === "wave" || r.ambientId === "forest" || r.ambientId === "cafe") {
    out.ambientId = r.ambientId;
  }
  if (typeof r.ambientVolume === "number") out.ambientVolume = clamp(r.ambientVolume, 0, 100);
  if (typeof r.ttsVolume === "number") out.ttsVolume = clamp(r.ttsVolume, 0, 100);
  if (typeof r.sleepTimer === "number") out.sleepTimer = clamp(r.sleepTimer, 0, 180);
  return out;
}

function readLayer(key: string): Partial<ReaderPrefs> {
  const raw = kvGet(key);
  if (!raw) return {};
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return {};
  }
}

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READER_PREFS_EVENT));
  }
}

/* ── CRUD ── */

/** 读取有效偏好：内置默认 ← 全局默认 ← 单本书覆盖 */
export function loadReaderPrefs(bookId?: string): ReaderPrefs {
  const merged: ReaderPrefs = {
    ...BUILTIN_READER_PREFS,
    ...readLayer(DEFAULT_KEY),
    ...(bookId ? readLayer(BOOK_PREFIX + bookId) : {}),
  };
  return merged;
}

export function hasBookReaderPrefs(bookId: string): boolean {
  return kvGet(BOOK_PREFIX + bookId) !== null;
}

export function saveBookReaderPrefs(bookId: string, prefs: ReaderPrefs): void {
  kvSet(BOOK_PREFIX + bookId, JSON.stringify(prefs));
  notify();
}

export function saveDefaultReaderPrefs(prefs: ReaderPrefs): void {
  kvSet(DEFAULT_KEY, JSON.stringify(prefs));
  notify();
}

/** 清除单本书覆盖，回落到全局默认 */
export function clearBookReaderPrefs(bookId: string): void {
  kvRemove(BOOK_PREFIX + bookId);
  notify();
}

/* ── 渲染派生 ── */

/** 根据纸底 + 背景明暗计算最终背景 / 正文色 */
export function resolveReaderColors(prefs: ReaderPrefs): { bg: string; text: string; dark: boolean } {
  const paper = READER_PAPERS[prefs.paper];
  const t = ((100 - prefs.brightness) / 100) * 0.55;
  const bg = t > 0 ? mixHex(paper.bg, "#000000", t) : paper.bg;
  // 压暗较多时文字轻微向背景靠，降低刺眼对比
  const text = prefs.brightness < 55 ? mixHex(paper.text, bg, 0.12) : paper.text;
  return { bg, text, dark: prefs.paper === "night-gray" || prefs.brightness < 55 };
}

/** 生成注入阅读器根节点的 CSS 变量（内联 style，优先级高于全局皮肤） */
export function buildReaderPrefsCssVars(prefs: ReaderPrefs): Record<string, string> {
  const { text } = resolveReaderColors(prefs);
  return {
    "--reader-font-family": FONT_FAMILY_CSS[prefs.fontFamily],
    "--reader-font-size": `${prefs.fontSize}px`,
    "--reader-font-weight": String(prefs.fontWeight),
    "--reader-line-height": String(prefs.lineHeight),
    "--reader-paragraph-spacing": `${prefs.paragraphSpacing}em`,
    "--reader-padding-x": `${prefs.paddingX}px`,
    "--reader-text-width": `${prefs.textWidth}%`,
    "--reader-text-align": prefs.justify ? "justify" : "left",
    "--reader-text": text,
    "--reader-indent": prefs.indentFirstLine ? "2em" : "0",
  };
}

/** 纸张纹理：feTurbulence SVG data URI（仅 strength>0 时返回） */
export function buildReaderTexture(strength: number): { backgroundImage: string; opacity: number } | null {
  if (strength <= 0) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    opacity: (strength / 100) * 0.5,
  };
}
