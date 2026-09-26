/**
 * 书房「外观工作室」— 全局外观 token + 预设（Phase 8A）。
 *
 * 设计原则：
 *   - 所有可调项映射为 CSS 变量（--book-*），实时应用到 .bookroom-app；
 *   - 强调色允许高饱和，但只用于小面积（进度、状态、高亮、标签）；
 *   - 预设切换即时生效，用户可在此基础上微调；
 *   - 持久化到 kv-db，versioned schema。
 */
import { kvGet, kvSet } from "./kv-db";

const APPEARANCE_KEY = "bookroom-appearance:v1";

export type AppearanceTokens = {
  /** 主背景 */
  bgPrimary: string;
  /** 次背景 */
  bgSecondary: string;
  /** 文字主色 */
  textPrimary: string;
  /** 文字次色 */
  textSecondary: string;
  /** 强调色（小面积使用） */
  accent: string;
  /** 卡片透明度 0~100 */
  cardOpacity: number;
  /** 卡片模糊强度 0~40 */
  cardBlur: number;
  /** 卡片阴影强度 0~100 */
  cardShadow: number;
  /** 边框亮度 0~100 */
  borderBrightness: number;
  /** 圆角 0~24 */
  radius: number;
  /** 玻璃高光 / 折射强度 0~100 */
  glassHighlight: number;
  /** 浅色 / 深色 */
  mode: "light" | "dark";
};

export type AppearancePresetId = "pearl-white" | "night-pearl" | "paper" | "mist-blue" | "custom";

export type AppearancePreset = {
  id: AppearancePresetId;
  name: string;
  description: string;
  tokens: AppearanceTokens;
};

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  {
    id: "pearl-white",
    name: "Pearl White",
    description: "纯白冷雾 · 液态玻璃",
    tokens: {
      bgPrimary: "#FFFFFF",
      bgSecondary: "#F6F8FB",
      textPrimary: "#101318",
      textSecondary: "#5B6472",
      accent: "#2F6BFF",
      cardOpacity: 72,
      cardBlur: 22,
      cardShadow: 34,
      borderBrightness: 82,
      radius: 18,
      glassHighlight: 60,
      mode: "light",
    },
  },
  {
    id: "night-pearl",
    name: "Night Pearl",
    description: "石墨深夜 · 银灰高光",
    tokens: {
      /* 深石墨灰而非死黑；文字柔白而非纯白（Phase 9B 强化） */
      bgPrimary: "#12151B",
      bgSecondary: "#1A1E26",
      textPrimary: "#E6EAF0",
      textSecondary: "#9AA4B2",
      accent: "#8FB8F5",
      cardOpacity: 52,
      cardBlur: 26,
      cardShadow: 52,
      borderBrightness: 34,
      radius: 18,
      glassHighlight: 44,
      mode: "dark",
    },
  },
  {
    id: "paper",
    name: "Paper Ivory",
    description: "暖象牙纸 · 低玻璃 · 纸纹",
    tokens: {
      /* 暖象牙纸：明显偏暖、弱玻璃、纸张颗粒感（Phase 9B 强化） */
      bgPrimary: "#FAF3E6",
      bgSecondary: "#F0E8D6",
      textPrimary: "#2B251A",
      textSecondary: "#786E5C",
      accent: "#8A6B3F",
      cardOpacity: 88,
      cardBlur: 5,
      cardShadow: 20,
      borderBrightness: 90,
      radius: 14,
      glassHighlight: 14,
      mode: "light",
    },
  },
  {
    id: "mist-blue",
    name: "Mist Blue",
    description: "雾蓝浸染 · 冷蓝玻璃",
    tokens: {
      bgPrimary: "#E9F1F8",
      bgSecondary: "#DAE6F2",
      textPrimary: "#0E1726",
      textSecondary: "#4E6076",
      accent: "#1D74D8",
      cardOpacity: 60,
      cardBlur: 26,
      cardShadow: 30,
      borderBrightness: 76,
      radius: 20,
      glassHighlight: 66,
      mode: "light",
    },
  },
];

export const DEFAULT_APPEARANCE: AppearanceTokens = { ...APPEARANCE_PRESETS[0].tokens };

export type BookroomAppearance = {
  version: 1;
  presetId: AppearancePresetId;
  tokens: AppearanceTokens;
};

export const DEFAULT_BOOKROOM_APPEARANCE: BookroomAppearance = {
  version: 1,
  presetId: "pearl-white",
  tokens: { ...DEFAULT_APPEARANCE },
};

function migrateTokens(raw: unknown): AppearanceTokens {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APPEARANCE };
  const t = raw as Partial<AppearanceTokens>;
  return {
    bgPrimary: typeof t.bgPrimary === "string" ? t.bgPrimary : DEFAULT_APPEARANCE.bgPrimary,
    bgSecondary: typeof t.bgSecondary === "string" ? t.bgSecondary : DEFAULT_APPEARANCE.bgSecondary,
    textPrimary: typeof t.textPrimary === "string" ? t.textPrimary : DEFAULT_APPEARANCE.textPrimary,
    textSecondary: typeof t.textSecondary === "string" ? t.textSecondary : DEFAULT_APPEARANCE.textSecondary,
    accent: typeof t.accent === "string" ? t.accent : DEFAULT_APPEARANCE.accent,
    cardOpacity: typeof t.cardOpacity === "number" ? Math.min(100, Math.max(0, t.cardOpacity)) : DEFAULT_APPEARANCE.cardOpacity,
    cardBlur: typeof t.cardBlur === "number" ? Math.min(40, Math.max(0, t.cardBlur)) : DEFAULT_APPEARANCE.cardBlur,
    cardShadow: typeof t.cardShadow === "number" ? Math.min(100, Math.max(0, t.cardShadow)) : DEFAULT_APPEARANCE.cardShadow,
    borderBrightness: typeof t.borderBrightness === "number" ? Math.min(100, Math.max(0, t.borderBrightness)) : DEFAULT_APPEARANCE.borderBrightness,
    radius: typeof t.radius === "number" ? Math.min(24, Math.max(0, t.radius)) : DEFAULT_APPEARANCE.radius,
    glassHighlight: typeof t.glassHighlight === "number" ? Math.min(100, Math.max(0, t.glassHighlight)) : DEFAULT_APPEARANCE.glassHighlight,
    mode: t.mode === "dark" ? "dark" : "light",
  };
}

export function loadBookroomAppearance(): BookroomAppearance {
  const raw = kvGet(APPEARANCE_KEY);
  if (!raw) return { ...DEFAULT_BOOKROOM_APPEARANCE, tokens: { ...DEFAULT_BOOKROOM_APPEARANCE.tokens } };
  try {
    const parsed = JSON.parse(raw) as Partial<BookroomAppearance>;
    return {
      version: 1,
      presetId: typeof parsed.presetId === "string" && ["pearl-white", "night-pearl", "paper", "mist-blue", "custom"].includes(parsed.presetId)
        ? (parsed.presetId as AppearancePresetId)
        : "custom",
      tokens: migrateTokens(parsed.tokens),
    };
  } catch {
    return { ...DEFAULT_BOOKROOM_APPEARANCE, tokens: { ...DEFAULT_BOOKROOM_APPEARANCE.tokens } };
  }
}

export function saveBookroomAppearance(appearance: BookroomAppearance): void {
  kvSet(APPEARANCE_KEY, JSON.stringify(appearance));
}

export function applyAppearancePreset(presetId: AppearancePresetId): BookroomAppearance {
  const preset = APPEARANCE_PRESETS.find(p => p.id === presetId);
  const appearance: BookroomAppearance = {
    version: 1,
    presetId,
    tokens: preset ? { ...preset.tokens } : { ...DEFAULT_APPEARANCE },
  };
  saveBookroomAppearance(appearance);
  return appearance;
}

export function updateAppearanceTokens(patch: Partial<AppearanceTokens>): BookroomAppearance {
  const current = loadBookroomAppearance();
  const next: BookroomAppearance = {
    ...current,
    presetId: "custom",
    tokens: { ...current.tokens, ...patch },
  };
  saveBookroomAppearance(next);
  return next;
}

/* ───────────────────────── 颜色工具 ───────────────────────── */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** 判断浅色 / 深色（用于在用户主背景上推导玻璃层） */
function isLightHex(hex: string): boolean {
  const c = hexToRgb(hex);
  if (!c) return true;
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000 > 150;
}

/**
 * 将外观 token 转换为完整 Pearl Glass CSS 变量映射（Phase 8B）。
 * 同时覆盖旧 --book-* 基础变量（全房组件零改动即跟随）与新 --bookroom-* 语义层。
 */
export function appearanceToCssVars(tokens: AppearanceTokens): Record<string, string> {
  const dark = tokens.mode === "dark";
  const alpha = Math.min(0.92, Math.max(0.25, tokens.cardOpacity / 100));
  const borderAlpha = dark
    ? Math.min(0.22, Math.max(0.05, (100 - tokens.borderBrightness) / 380))
    : Math.min(0.16, Math.max(0.04, tokens.borderBrightness / 1100));
  const shadowAlpha = (tokens.cardShadow / 100 * 0.14).toFixed(3);
  const hl = (tokens.glassHighlight / 100).toFixed(2);
  const rLg = tokens.radius + 8;
  const rXl = tokens.radius + 14;
  const light = isLightHex(tokens.bgPrimary);

  // 玻璃面：浅模式白玻璃，深模式冷灰玻璃
  const glassBase = dark ? "#1C2028" : "#FFFFFF";
  const glassSoft = dark ? "#15181E" : tokens.bgSecondary;
  const inkTertiary = dark ? "rgba(244,246,248,0.42)" : rgba(tokens.textPrimary, 0.42);
  const iconBtnBg = dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.55)";
  const iconBtnBorder = dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)";
  const paper = dark ? "#15181E" : "#FCFCFA";
  const shelfWood = dark
    ? "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02)), #1A1D24"
    : "linear-gradient(180deg, #F2F4F7, #E7EBF0)";

  /* ── Phase 9B-2：统一 --br-* 语义层（按钮/控件一律用 semantic foreground，禁止写死黑白） ── */
  const borderColor = dark ? `rgba(255,255,255,${borderAlpha})` : `rgba(17,19,24,${borderAlpha})`;
  const accentLight = isLightHex(tokens.accent);
  const accentFg = accentLight ? "#0E1320" : "#F4F8FF";
  const controlBg = rgba(glassBase, dark ? 0.28 : 0.62);
  const controlBgActive = tokens.accent;
  const controlFg = tokens.textPrimary;
  const glassFill = rgba(glassBase, alpha);
  const glassBorder = dark
    ? `rgba(214,224,238,${Math.min(0.22, borderAlpha + 0.04)})`
    : `rgba(255,255,255,${Math.max(0.55, 1 - borderAlpha * 1.6)})`;
  const glassHighlight = dark
    ? `rgba(226,234,246,${Math.min(0.16, 0.05 + tokens.glassHighlight / 900)})`
    : `rgba(255,255,255,${Math.min(0.9, 0.35 + tokens.glassHighlight / 180)})`;
  const divider = dark ? "rgba(226,232,240,0.09)" : "rgba(17,19,24,0.07)";
  /* iMessage 气泡：自己=可识别蓝；对方=浅灰（深模式深灰 surface） */
  const bubbleMine = tokens.accent;
  const bubbleMineInk = accentFg;
  const bubbleOther = dark ? "#222730" : "#E9EDF2";
  const bubbleOtherInk = dark ? "#E6EAF0" : "#15171C";
  const scrim = dark ? "rgba(6,8,12,0.55)" : "rgba(17,20,26,0.34)";

  return {
    /* ── 旧基础变量（保持全房组件兼容） ── */
    "--book-bg": tokens.bgPrimary,
    "--book-surface": rgba(glassBase, alpha * 0.82),
    "--book-surface-strong": rgba(glassBase, alpha),
    "--book-border": dark ? `rgba(255,255,255,${borderAlpha})` : `rgba(17,19,24,${borderAlpha})`,
    "--book-text": tokens.textPrimary,
    "--book-text-secondary": tokens.textSecondary,
    "--book-text-tertiary": inkTertiary,
    "--book-radius-xl": `${rXl}px`,
    "--book-radius-lg": `${rLg}px`,
    "--book-radius-md": `${tokens.radius}px`,
    "--book-radius-sm": `${Math.max(10, tokens.radius - 5)}px`,
    "--book-accent-red": dark ? "#F08A82" : "#D26B61",
    "--book-accent-blue": tokens.accent,
    "--book-accent-gold": dark ? "#E3C988" : "#C9A85F",

    /* ── Phase 8B 语义层 ── */
    "--bookroom-bg": tokens.bgPrimary,
    "--bookroom-bg-2": tokens.bgSecondary,
    "--bookroom-surface": rgba(glassBase, alpha * 0.82),
    "--bookroom-surface-strong": rgba(glassBase, alpha),
    "--bookroom-surface-soft": rgba(glassSoft, dark ? 0.5 : 0.55),
    "--bookroom-text": tokens.textPrimary,
    "--bookroom-text-2": tokens.textSecondary,
    "--bookroom-text-3": inkTertiary,
    "--bookroom-border": dark ? `rgba(255,255,255,${borderAlpha})` : `rgba(17,19,24,${borderAlpha})`,
    "--bookroom-highlight": tokens.accent,
    "--bookroom-glass-alpha": String(alpha),
    "--bookroom-glass-blur": `${tokens.cardBlur}px`,
    "--bookroom-glass-hl": hl,
    "--bookroom-shadow": `0 12px 32px rgba(0,0,0,${shadowAlpha})`,
    "--bookroom-shadow-soft": `0 2px 10px rgba(0,0,0,${(tokens.cardShadow / 100 * 0.06).toFixed(3)})`,
    "--bookroom-radius": `${tokens.radius}px`,
    "--bookroom-radius-lg": `${rLg}px`,
    "--bookroom-accent": tokens.accent,
    "--bookroom-icon-btn-bg": iconBtnBg,
    "--bookroom-icon-btn-border": iconBtnBorder,
    "--bookroom-paper": paper,
    "--bookroom-shelf-wood": shelfWood,
    "--bookroom-is-light": light ? "1" : "0",

    /* ── Phase 9B-2：--br-* 统一语义变量（全房控件唯一切入点） ── */
    "--br-bg": tokens.bgPrimary,
    "--br-bg-secondary": tokens.bgSecondary,
    "--br-surface": glassFill,
    "--br-surface-soft": rgba(glassSoft, dark ? 0.5 : 0.55),
    "--br-surface-strong": rgba(glassBase, alpha),
    "--br-text": tokens.textPrimary,
    "--br-text-secondary": tokens.textSecondary,
    "--br-text-tertiary": inkTertiary,
    "--br-border": borderColor,
    "--br-divider": divider,
    "--br-accent": tokens.accent,
    "--br-accent-foreground": accentFg,
    "--br-control-bg": controlBg,
    "--br-control-bg-active": controlBgActive,
    "--br-control-foreground": controlFg,
    "--br-control-foreground-active": accentFg,
    "--br-glass-fill": glassFill,
    "--br-glass-border": glassBorder,
    "--br-glass-highlight": glassHighlight,
    "--br-glass-blur": `${tokens.cardBlur}px`,
    "--br-radius": `${tokens.radius}px`,
    "--br-shadow": `0 12px 32px rgba(0,0,0,${shadowAlpha})`,
    "--br-shadow-soft": `0 2px 10px rgba(0,0,0,${(tokens.cardShadow / 100 * 0.06).toFixed(3)})`,
    "--br-scrim": scrim,
    "--br-bubble-mine": bubbleMine,
    "--br-bubble-mine-ink": bubbleMineInk,
    "--br-bubble-other": bubbleOther,
    "--br-bubble-other-ink": bubbleOtherInk,
  };
}

/**
 * 生成作用域 CSS 文本，注入到 .bookroom-app。
 * Phase 8B：含基础背景雾层、Pearl Glass 衍生面与阅读纸张跟随，深浅两套均在此输出。
 * Phase 9A：按 presetId 注入主题人格差异（雾层色相 / 阅读纸色 / 书架层板），
 *   让 4 套主题肉眼可分辨；自定义微调时 presetId="custom"，按深浅走通用雾层。
 */
export function buildAppearanceCss(tokens: AppearanceTokens, presetId?: AppearancePresetId): string {
  const vars = appearanceToCssVars(tokens);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  const dark = tokens.mode === "dark";
  // 根层雾：按主题人格区分（不只依赖深浅）
  let mist: string;
  if (presetId === "mist-blue") {
    mist = "radial-gradient(120% 56% at 16% 0%, rgba(186,212,238,0.5), rgba(186,212,238,0) 60%), radial-gradient(110% 60% at 100% 100%, rgba(158,190,226,0.55), rgba(158,190,226,0) 64%)";
  } else if (presetId === "paper") {
    /* 暖雾 + 纸张颗粒（SVG feTurbulence 平铺，低透明，reduced-motion 无动画属性不受影响） */
    const grain = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")";
    mist = `${grain}, radial-gradient(120% 56% at 16% 0%, rgba(246,238,220,0.9), rgba(246,238,220,0) 60%), radial-gradient(110% 60% at 100% 100%, rgba(226,214,188,0.55), rgba(226,214,188,0) 64%)`;
  } else if (dark) {
    mist = "radial-gradient(120% 56% at 16% 0%, rgba(96,165,250,0.07), rgba(0,0,0,0) 60%), radial-gradient(110% 60% at 100% 100%, rgba(255,255,255,0.04), rgba(0,0,0,0) 64%)";
  } else {
    mist = "radial-gradient(120% 56% at 16% 0%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%), radial-gradient(110% 60% at 100% 100%, rgba(214,226,240,0.55), rgba(214,226,240,0) 64%)";
  }
  // 主题级补色：阅读纸 / 书架层板按主题微调（buildAppearanceCss 幂等，可重复注入）
  const extra: Record<string, string> = {};
  if (presetId === "paper" && !dark) {
    extra["--bookroom-paper"] = "#F6EEDD";
    extra["--bookroom-shelf-wood"] = "linear-gradient(180deg, #EDE4D0, #DFD3BA)";
    extra["--bookroom-shelf-wood-stripe"] = "rgba(122,104,76,0.08)";
  } else if (presetId === "mist-blue" && !dark) {
    extra["--bookroom-paper"] = "#F3F8FC";
    extra["--bookroom-shelf-wood"] = "linear-gradient(180deg, #E2ECF6, #D0DFEE)";
    extra["--bookroom-shelf-wood-stripe"] = "rgba(60,98,140,0.07)";
  } else if (presetId === "night-pearl" || dark) {
    extra["--bookroom-paper"] = "#15181E";
  }
  const extraLines = Object.entries(extra).map(([k, v]) => `  ${k}: ${v};`);
  return [
    `.bookroom-app {`,
    ...lines,
    ...extraLines,
    `  --bookroom-mist: ${mist};`,
    `}`,
  ].join("\n");
}

/** 全局注入样式 id（app 启动时与外观工作室共用，避免重复 style 标签） */
export const BOOKROOM_APPEARANCE_STYLE_ID = "br-appearance-style";

/**
 * 启动时把已保存的外观 token 注入 document.head（Phase 8B）。
 * 不再依赖外观工作室是否打开；返回卸载函数。
 */
export function injectBookroomAppearance(): () => void {
  const appearance = loadBookroomAppearance();
  let styleEl = document.getElementById(BOOKROOM_APPEARANCE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = BOOKROOM_APPEARANCE_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildAppearanceCss(appearance.tokens, appearance.presetId);
  return () => {
    if (styleEl) styleEl.textContent = "";
  };
}
