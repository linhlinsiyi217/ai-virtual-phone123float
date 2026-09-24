/**
 * 书房「我的」页面 — 用户资料 / 头像框 / 背景 / 签名 持久化（Phase 8A）。
 *
 * 设计原则：
 *   - 用户拥有完整自主权，所有字段均可编辑；
 *   - 无硬编码默认值，首次使用显示真实空状态 / 占位提示；
 *   - 头像、头像框、背景均支持本地上传 / URL / 文件管理器导入；
 *   - 数据隔离：profile 只存 kv-db，不进入 AI 记忆或共读会话。
 */
import { kvGet, kvSet } from "./kv-db";

const PROFILE_KEY = "bookroom-profile:v1";

export type AvatarFrameSettings = {
  src: string | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  enabled: boolean;
};

export type ProfileBackground = {
  type: "default" | "solid" | "gradient" | "url" | "image";
  value: string;
  size?: "cover" | "contain";
  position?: string;
  blur?: number;
  brightness?: number;
  overlay?: number;
  saturation?: number;
  /** true = 同时设为书房全局背景 */
  applyGlobal?: boolean;
};

export type BookroomProfile = {
  version: 1;
  name: string;
  handle: string;
  bio: string;
  tags: string[];
  avatar: string | null;
  avatarFrame: AvatarFrameSettings;
  background: ProfileBackground;
  signature: string | null;
  showMusicCard: boolean;
};

const DEFAULT_FRAME: AvatarFrameSettings = {
  src: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  enabled: false,
};

const DEFAULT_BACKGROUND: ProfileBackground = {
  type: "default",
  value: "",
  size: "cover",
  position: "center",
  blur: 0,
  brightness: 100,
  overlay: 0,
  saturation: 100,
  applyGlobal: false,
};

export const DEFAULT_PROFILE: BookroomProfile = {
  version: 1,
  name: "",
  handle: "",
  bio: "",
  tags: [],
  avatar: null,
  avatarFrame: { ...DEFAULT_FRAME },
  background: { ...DEFAULT_BACKGROUND },
  signature: null,
  showMusicCard: false,
};

function migrate(raw: unknown): BookroomProfile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROFILE };
  const p = raw as Partial<BookroomProfile>;
  return {
    version: 1,
    name: typeof p.name === "string" ? p.name : DEFAULT_PROFILE.name,
    handle: typeof p.handle === "string" ? p.handle : DEFAULT_PROFILE.handle,
    bio: typeof p.bio === "string" ? p.bio : DEFAULT_PROFILE.bio,
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : DEFAULT_PROFILE.tags,
    avatar: typeof p.avatar === "string" ? p.avatar : DEFAULT_PROFILE.avatar,
    avatarFrame: p.avatarFrame && typeof p.avatarFrame === "object"
      ? {
          src: typeof p.avatarFrame.src === "string" ? p.avatarFrame.src : DEFAULT_FRAME.src,
          scale: typeof p.avatarFrame.scale === "number" ? p.avatarFrame.scale : DEFAULT_FRAME.scale,
          offsetX: typeof p.avatarFrame.offsetX === "number" ? p.avatarFrame.offsetX : DEFAULT_FRAME.offsetX,
          offsetY: typeof p.avatarFrame.offsetY === "number" ? p.avatarFrame.offsetY : DEFAULT_FRAME.offsetY,
          rotation: typeof p.avatarFrame.rotation === "number" ? p.avatarFrame.rotation : DEFAULT_FRAME.rotation,
          enabled: typeof p.avatarFrame.enabled === "boolean" ? p.avatarFrame.enabled : DEFAULT_FRAME.enabled,
        }
      : { ...DEFAULT_FRAME },
    background: p.background && typeof p.background === "object"
      ? {
          type: ["default", "solid", "gradient", "url", "image"].includes(p.background.type as string)
            ? (p.background.type as ProfileBackground["type"])
            : DEFAULT_BACKGROUND.type,
          value: typeof p.background.value === "string" ? p.background.value : DEFAULT_BACKGROUND.value,
          size: ["cover", "contain"].includes(p.background.size as string) ? (p.background.size as "cover" | "contain") : DEFAULT_BACKGROUND.size,
          position: typeof p.background.position === "string" ? p.background.position : DEFAULT_BACKGROUND.position,
          blur: typeof p.background.blur === "number" ? p.background.blur : DEFAULT_BACKGROUND.blur,
          brightness: typeof p.background.brightness === "number" ? p.background.brightness : DEFAULT_BACKGROUND.brightness,
          overlay: typeof p.background.overlay === "number" ? p.background.overlay : DEFAULT_BACKGROUND.overlay,
          saturation: typeof p.background.saturation === "number" ? p.background.saturation : DEFAULT_BACKGROUND.saturation,
          applyGlobal: typeof p.background.applyGlobal === "boolean" ? p.background.applyGlobal : DEFAULT_BACKGROUND.applyGlobal,
        }
      : { ...DEFAULT_BACKGROUND },
    signature: typeof p.signature === "string" ? p.signature : DEFAULT_PROFILE.signature,
    showMusicCard: typeof p.showMusicCard === "boolean" ? p.showMusicCard : DEFAULT_PROFILE.showMusicCard,
  };
}

export function loadBookroomProfile(): BookroomProfile {
  const raw = kvGet(PROFILE_KEY);
  if (!raw) return { ...DEFAULT_PROFILE };
  try {
    const parsed = JSON.parse(raw) as unknown;
    return migrate(parsed);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveBookroomProfile(profile: BookroomProfile): void {
  kvSet(PROFILE_KEY, JSON.stringify(profile));
}

export function updateBookroomProfile(patch: Partial<BookroomProfile>): BookroomProfile {
  const current = loadBookroomProfile();
  const next: BookroomProfile = { ...current, ...patch, version: 1 };
  if (patch.avatarFrame) next.avatarFrame = { ...current.avatarFrame, ...patch.avatarFrame };
  if (patch.background) next.background = { ...current.background, ...patch.background };
  saveBookroomProfile(next);
  return next;
}

/** 将本地文件转为 Data URL（头像 / 头像框 / 背景图通用） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 头像框 CSS transform 字符串 */
export function getAvatarFrameTransform(frame: AvatarFrameSettings): string {
  if (!frame.enabled || !frame.src) return "";
  return `translate(${frame.offsetX}px, ${frame.offsetY}px) scale(${frame.scale}) rotate(${frame.rotation}deg)`;
}

/** 我的页面背景样式 */
export function getProfileBackgroundStyle(bg: ProfileBackground): React.CSSProperties {
  if (bg.type === "default" || !bg.value) {
    return {};
  }
  const style: React.CSSProperties = {
    backgroundSize: bg.size ?? "cover",
    backgroundPosition: bg.position ?? "center",
    filter: `brightness(${bg.brightness ?? 100}%) saturate(${bg.saturation ?? 100}%)`,
  };
  if (bg.blur && bg.blur > 0) {
    style.filter = `${style.filter ?? ""} blur(${bg.blur}px)`.trim();
  }
  if (bg.type === "solid") {
    style.backgroundColor = bg.value;
  } else if (bg.type === "gradient") {
    style.backgroundImage = bg.value;
  } else if (bg.type === "url" || bg.type === "image") {
    style.backgroundImage = `url(${bg.value})`;
  }
  return style;
}

/** 背景叠层遮罩（降低背景干扰文字） */
export function getProfileOverlayStyle(bg: ProfileBackground): React.CSSProperties {
  const opacity = (bg.overlay ?? 0) / 100;
  if (!opacity) return { display: "none" };
  return { backgroundColor: `rgba(255,255,255,${opacity})` };
}
