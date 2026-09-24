/**
 * 书房「阅读皮肤」— ReadingView / MangaReaderView 高级美化（Phase 8A）。
 *
 * 设计原则：
 *   - 作用域严格限定在 .bookroom-reader-skin-root 内，不影响 Dock / 状态栏 / 抽屉；
 *   - 支持背景、排版、章节装饰、翻页、工具样式、叠层纹理；
 *   - 高级模式允许用户编写自定义 CSS，自动包裹作用域；
 *   - 皮肤可保存 / 复制 / 删除 / 导出 / 导入。
 */
import { kvGet, kvSet } from "./kv-db";

const SKINS_KEY = "bookroom-reading-skins:v1";
const ACTIVE_SKIN_KEY = "bookroom-reading-skins:active";

export type ReaderBackground = {
  type: "solid" | "gradient" | "image" | "texture" | "custom";
  value: string;
  /** 自定义 CSS background 值（type=custom 时使用） */
  cssValue?: string;
};

export type ReaderTypography = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  paragraphSpacing: number;
  paddingHorizontal: number;
  textWidth: number;
  textAlign: "left" | "justify" | "center";
};

export type ReaderChapterStyle = {
  titleSize: number;
  titleWeight: number;
  titleAlign: "left" | "center" | "right";
  showDivider: boolean;
  dividerStyle: "line" | "dots" | "none";
  firstCharStyle: "none" | "large" | "drop-cap";
  indent: number;
};

export type ReaderPageMode = {
  mode: "scroll" | "page";
  animationIntensity: number;
  reducedMotion: boolean;
};

export type ReaderToolStyle = {
  menuBg: string;
  menuRadius: number;
  highlightColors: string[];
  annotationStyle: "minimal" | "card" | "underline";
};

export type ReaderOverlay = {
  type: "none" | "grid" | "rain" | "paper" | "custom";
  opacity: number;
  customSrc?: string;
};

export type ReadingSkin = {
  id: string;
  name: string;
  version: 1;
  background: ReaderBackground;
  typography: ReaderTypography;
  chapter: ReaderChapterStyle;
  page: ReaderPageMode;
  tools: ReaderToolStyle;
  overlay: ReaderOverlay;
  /** 用户自定义 CSS（自动包裹作用域） */
  customCss: string;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_TYPOGRAPHY: ReaderTypography = {
  fontFamily: "inherit",
  fontSize: 17,
  fontWeight: 400,
  letterSpacing: 0.3,
  lineHeight: 1.9,
  paragraphSpacing: 1.2,
  paddingHorizontal: 24,
  textWidth: 100,
  textAlign: "justify",
};

const DEFAULT_CHAPTER: ReaderChapterStyle = {
  titleSize: 22,
  titleWeight: 600,
  titleAlign: "center",
  showDivider: true,
  dividerStyle: "line",
  firstCharStyle: "none",
  indent: 0,
};

const DEFAULT_PAGE: ReaderPageMode = {
  mode: "scroll",
  animationIntensity: 50,
  reducedMotion: false,
};

const DEFAULT_TOOLS: ReaderToolStyle = {
  menuBg: "rgba(255,255,255,0.92)",
  menuRadius: 12,
  highlightColors: ["#BFDBFE", "#FEF3C7", "#FECACA", "#BBF7D0"],
  annotationStyle: "minimal",
};

const DEFAULT_OVERLAY: ReaderOverlay = {
  type: "none",
  opacity: 30,
};

export const DEFAULT_SKIN: Omit<ReadingSkin, "id" | "name" | "createdAt" | "updatedAt"> = {
  version: 1,
  background: { type: "solid", value: "#FFFFFF" },
  typography: { ...DEFAULT_TYPOGRAPHY },
  chapter: { ...DEFAULT_CHAPTER },
  page: { ...DEFAULT_PAGE },
  tools: { ...DEFAULT_TOOLS },
  overlay: { ...DEFAULT_OVERLAY },
  customCss: "",
};

function makeId(): string {
  return `skin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function migrateSkin(raw: unknown): ReadingSkin | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<ReadingSkin>;
  if (typeof s.id !== "string" || typeof s.name !== "string") return null;
  const now = Date.now();
  return {
    id: s.id,
    name: s.name,
    version: 1,
    background: s.background && typeof s.background === "object"
      ? {
          type: ["solid", "gradient", "image", "texture", "custom"].includes(s.background.type as string)
            ? (s.background.type as ReaderBackground["type"])
            : "solid",
          value: typeof s.background.value === "string" ? s.background.value : "#FFFFFF",
          cssValue: typeof s.background.cssValue === "string" ? s.background.cssValue : undefined,
        }
      : { type: "solid", value: "#FFFFFF" },
    typography: s.typography && typeof s.typography === "object"
      ? {
          fontFamily: typeof s.typography.fontFamily === "string" ? s.typography.fontFamily : DEFAULT_TYPOGRAPHY.fontFamily,
          fontSize: typeof s.typography.fontSize === "number" ? s.typography.fontSize : DEFAULT_TYPOGRAPHY.fontSize,
          fontWeight: typeof s.typography.fontWeight === "number" ? s.typography.fontWeight : DEFAULT_TYPOGRAPHY.fontWeight,
          letterSpacing: typeof s.typography.letterSpacing === "number" ? s.typography.letterSpacing : DEFAULT_TYPOGRAPHY.letterSpacing,
          lineHeight: typeof s.typography.lineHeight === "number" ? s.typography.lineHeight : DEFAULT_TYPOGRAPHY.lineHeight,
          paragraphSpacing: typeof s.typography.paragraphSpacing === "number" ? s.typography.paragraphSpacing : DEFAULT_TYPOGRAPHY.paragraphSpacing,
          paddingHorizontal: typeof s.typography.paddingHorizontal === "number" ? s.typography.paddingHorizontal : DEFAULT_TYPOGRAPHY.paddingHorizontal,
          textWidth: typeof s.typography.textWidth === "number" ? s.typography.textWidth : DEFAULT_TYPOGRAPHY.textWidth,
          textAlign: ["left", "justify", "center"].includes(s.typography.textAlign as string)
            ? (s.typography.textAlign as ReaderTypography["textAlign"])
            : DEFAULT_TYPOGRAPHY.textAlign,
        }
      : { ...DEFAULT_TYPOGRAPHY },
    chapter: s.chapter && typeof s.chapter === "object"
      ? {
          titleSize: typeof s.chapter.titleSize === "number" ? s.chapter.titleSize : DEFAULT_CHAPTER.titleSize,
          titleWeight: typeof s.chapter.titleWeight === "number" ? s.chapter.titleWeight : DEFAULT_CHAPTER.titleWeight,
          titleAlign: ["left", "center", "right"].includes(s.chapter.titleAlign as string)
            ? (s.chapter.titleAlign as ReaderChapterStyle["titleAlign"])
            : DEFAULT_CHAPTER.titleAlign,
          showDivider: typeof s.chapter.showDivider === "boolean" ? s.chapter.showDivider : DEFAULT_CHAPTER.showDivider,
          dividerStyle: ["line", "dots", "none"].includes(s.chapter.dividerStyle as string)
            ? (s.chapter.dividerStyle as ReaderChapterStyle["dividerStyle"])
            : DEFAULT_CHAPTER.dividerStyle,
          firstCharStyle: ["none", "large", "drop-cap"].includes(s.chapter.firstCharStyle as string)
            ? (s.chapter.firstCharStyle as ReaderChapterStyle["firstCharStyle"])
            : DEFAULT_CHAPTER.firstCharStyle,
          indent: typeof s.chapter.indent === "number" ? s.chapter.indent : DEFAULT_CHAPTER.indent,
        }
      : { ...DEFAULT_CHAPTER },
    page: s.page && typeof s.page === "object"
      ? {
          mode: ["scroll", "page"].includes(s.page.mode as string) ? (s.page.mode as ReaderPageMode["mode"]) : DEFAULT_PAGE.mode,
          animationIntensity: typeof s.page.animationIntensity === "number" ? s.page.animationIntensity : DEFAULT_PAGE.animationIntensity,
          reducedMotion: typeof s.page.reducedMotion === "boolean" ? s.page.reducedMotion : DEFAULT_PAGE.reducedMotion,
        }
      : { ...DEFAULT_PAGE },
    tools: s.tools && typeof s.tools === "object"
      ? {
          menuBg: typeof s.tools.menuBg === "string" ? s.tools.menuBg : DEFAULT_TOOLS.menuBg,
          menuRadius: typeof s.tools.menuRadius === "number" ? s.tools.menuRadius : DEFAULT_TOOLS.menuRadius,
          highlightColors: Array.isArray(s.tools.highlightColors)
            ? s.tools.highlightColors.filter((c): c is string => typeof c === "string").slice(0, 8)
            : [...DEFAULT_TOOLS.highlightColors],
          annotationStyle: ["minimal", "card", "underline"].includes(s.tools.annotationStyle as string)
            ? (s.tools.annotationStyle as ReaderToolStyle["annotationStyle"])
            : DEFAULT_TOOLS.annotationStyle,
        }
      : { ...DEFAULT_TOOLS },
    overlay: s.overlay && typeof s.overlay === "object"
      ? {
          type: ["none", "grid", "rain", "paper", "custom"].includes(s.overlay.type as string)
            ? (s.overlay.type as ReaderOverlay["type"])
            : DEFAULT_OVERLAY.type,
          opacity: typeof s.overlay.opacity === "number" ? s.overlay.opacity : DEFAULT_OVERLAY.opacity,
          customSrc: typeof s.overlay.customSrc === "string" ? s.overlay.customSrc : undefined,
        }
      : { ...DEFAULT_OVERLAY },
    customCss: typeof s.customCss === "string" ? s.customCss : "",
    createdAt: typeof s.createdAt === "number" ? s.createdAt : now,
    updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : now,
  };
}

export function listReadingSkins(): ReadingSkin[] {
  const raw = kvGet(SKINS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateSkin).filter((s): s is ReadingSkin => s !== null);
  } catch {
    return [];
  }
}

export function getReadingSkin(id: string): ReadingSkin | null {
  return listReadingSkins().find(s => s.id === id) ?? null;
}

export function saveReadingSkin(skin: Omit<ReadingSkin, "id" | "createdAt" | "updatedAt"> & { id?: string }): ReadingSkin {
  const list = listReadingSkins();
  const now = Date.now();
  if (skin.id) {
    const index = list.findIndex(s => s.id === skin.id);
    if (index >= 0) {
      const updated: ReadingSkin = { ...list[index], ...skin, id: skin.id, updatedAt: now };
      list[index] = updated;
      kvSet(SKINS_KEY, JSON.stringify(list));
      return updated;
    }
  }
  const created: ReadingSkin = { ...skin, id: skin.id ?? makeId(), createdAt: now, updatedAt: now };
  list.push(created);
  kvSet(SKINS_KEY, JSON.stringify(list));
  return created;
}

export function deleteReadingSkin(id: string): void {
  const list = listReadingSkins().filter(s => s.id !== id);
  kvSet(SKINS_KEY, JSON.stringify(list));
  if (loadActiveSkinId() === id) {
    kvSet(ACTIVE_SKIN_KEY, "");
  }
}

export function duplicateReadingSkin(id: string): ReadingSkin | null {
  const source = getReadingSkin(id);
  if (!source) return null;
  return saveReadingSkin({
    ...source,
    id: undefined,
    name: `${source.name} 副本`,
  });
}

export function loadActiveSkinId(): string | null {
  const id = kvGet(ACTIVE_SKIN_KEY);
  return id || null;
}

export function setActiveSkinId(id: string | null): void {
  kvSet(ACTIVE_SKIN_KEY, id ?? "");
}

export function getActiveReadingSkin(): ReadingSkin | null {
  const id = loadActiveSkinId();
  if (!id) return null;
  return getReadingSkin(id);
}

/** 将皮肤转换为作用域 CSS 变量 + 自定义 CSS */
export function buildSkinCss(skin: ReadingSkin): string {
  const t = skin.typography;
  const c = skin.chapter;
  const p = skin.page;
  const lines: string[] = [];

  // 背景
  const bg = skin.background;
  if (bg.type === "custom" && bg.cssValue) {
    lines.push(`  background: ${bg.cssValue};`);
  } else if (bg.type === "solid") {
    lines.push(`  background-color: ${bg.value};`);
  } else if (bg.type === "gradient") {
    lines.push(`  background: ${bg.value};`);
  } else if (bg.type === "image") {
    lines.push(`  background-image: url(${bg.value});`);
    lines.push(`  background-size: cover;`);
    lines.push(`  background-position: center;`);
  }

  // 排版
  lines.push(`  --reader-font-family: ${t.fontFamily};`);
  lines.push(`  --reader-font-size: ${t.fontSize}px;`);
  lines.push(`  --reader-font-weight: ${t.fontWeight};`);
  lines.push(`  --reader-letter-spacing: ${t.letterSpacing}px;`);
  lines.push(`  --reader-line-height: ${t.lineHeight};`);
  lines.push(`  --reader-paragraph-spacing: ${t.paragraphSpacing}em;`);
  lines.push(`  --reader-padding-x: ${t.paddingHorizontal}px;`);
  lines.push(`  --reader-text-width: ${t.textWidth}%;`);
  lines.push(`  --reader-text-align: ${t.textAlign};`);

  // 章节
  lines.push(`  --reader-chapter-title-size: ${c.titleSize}px;`);
  lines.push(`  --reader-chapter-title-weight: ${c.titleWeight};`);
  lines.push(`  --reader-chapter-title-align: ${c.titleAlign};`);
  lines.push(`  --reader-chapter-indent: ${c.indent}em;`);

  // 翻页
  lines.push(`  --reader-animation-intensity: ${p.animationIntensity}%;`);

  // 工具
  lines.push(`  --reader-menu-bg: ${skin.tools.menuBg};`);
  lines.push(`  --reader-menu-radius: ${skin.tools.menuRadius}px;`);

  // 自定义 CSS 包裹作用域
  let customBlock = "";
  if (skin.customCss.trim()) {
    customBlock = `\n.bookroom-reader-skin-root {\n${skin.customCss
      .split("\n")
      .map(line => `  ${line}`)
      .join("\n")}\n}`;
  }

  return `.bookroom-reader-skin-root {\n${lines.join("\n")}\n}${customBlock}`;
}

/** 导出皮肤为 JSON */
export function exportReadingSkin(skin: ReadingSkin): string {
  return JSON.stringify(skin, null, 2);
}

/** 从 JSON 导入皮肤 */
export function importReadingSkin(json: string): ReadingSkin | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    const skin = migrateSkin(parsed);
    if (!skin) return null;
    // 重新分配 id，避免冲突
    return saveReadingSkin({ ...skin, id: undefined });
  } catch {
    return null;
  }
}
