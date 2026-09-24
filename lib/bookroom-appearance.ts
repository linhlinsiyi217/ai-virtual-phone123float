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
    description: "纯白 + 黑 + 极浅冷蓝",
    tokens: {
      bgPrimary: "#FFFFFF",
      bgSecondary: "#F8FAFC",
      textPrimary: "#111318",
      textSecondary: "#5E6672",
      accent: "#3B82F6",
      cardOpacity: 72,
      cardBlur: 20,
      cardShadow: 35,
      borderBrightness: 82,
      radius: 16,
      glassHighlight: 55,
      mode: "light",
    },
  },
  {
    id: "night-pearl",
    name: "Night Pearl",
    description: "深黑灰 + 冷白",
    tokens: {
      bgPrimary: "#111318",
      bgSecondary: "#1A1D24",
      textPrimary: "#F1F5F9",
      textSecondary: "#94A3B8",
      accent: "#60A5FA",
      cardOpacity: 58,
      cardBlur: 24,
      cardShadow: 45,
      borderBrightness: 30,
      radius: 16,
      glassHighlight: 35,
      mode: "dark",
    },
  },
  {
    id: "paper",
    name: "Paper",
    description: "纸张阅读感，干净不泛黄",
    tokens: {
      bgPrimary: "#FDFCF9",
      bgSecondary: "#F5F3EE",
      textPrimary: "#1A1B1E",
      textSecondary: "#5C6066",
      accent: "#2563EB",
      cardOpacity: 78,
      cardBlur: 12,
      cardShadow: 28,
      borderBrightness: 85,
      radius: 10,
      glassHighlight: 30,
      mode: "light",
    },
  },
  {
    id: "mist-blue",
    name: "Mist Blue",
    description: "极浅冷蓝雾感",
    tokens: {
      bgPrimary: "#F2F6FA",
      bgSecondary: "#E8EEF5",
      textPrimary: "#111318",
      textSecondary: "#5E6672",
      accent: "#0EA5E9",
      cardOpacity: 65,
      cardBlur: 22,
      cardShadow: 32,
      borderBrightness: 80,
      radius: 18,
      glassHighlight: 60,
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

/** 将外观 token 转换为 CSS 变量映射 */
export function appearanceToCssVars(tokens: AppearanceTokens): Record<string, string> {
  const alpha = (tokens.cardOpacity / 100).toFixed(2);
  const borderAlpha = (tokens.borderBrightness / 100).toFixed(2);
  const shadowAlpha = (tokens.cardShadow / 100 * 0.15).toFixed(3);
  return {
    "--book-bg-primary": tokens.bgPrimary,
    "--book-bg-secondary": tokens.bgSecondary,
    "--book-text": tokens.textPrimary,
    "--book-text-secondary": tokens.textSecondary,
    "--book-accent": tokens.accent,
    "--book-card-bg": `rgba(255,255,255,${alpha})`,
    "--book-card-bg-dark": `rgba(17,19,24,${alpha})`,
    "--book-card-blur": `${tokens.cardBlur}px`,
    "--book-card-shadow": `0 8px 32px rgba(0,0,0,${shadowAlpha})`,
    "--book-border": `rgba(0,0,0,${borderAlpha})`,
    "--book-radius": `${tokens.radius}px`,
    "--book-glass-highlight": `${tokens.glassHighlight}%`,
  };
}

/** 生成作用域 CSS 文本，注入到 .bookroom-app */
export function buildAppearanceCss(tokens: AppearanceTokens): string {
  const vars = appearanceToCssVars(tokens);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `.bookroom-app {\n${lines.join("\n")}\n}`;
}
