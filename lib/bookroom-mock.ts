/**
 * 书房壳层（BookRoom Shell）— 本地 Mock 数据。
 *
 * 本轮只做 IA 重构与视觉壳层：陪读角色优先读 Float 本地角色卡（kv-db，
 * 非后端），无角色卡时使用本文件兜底 mock；统计、语录、草稿均为演示数据，
 * 不接任何在线服务。
 */
import { loadCharacters } from "./character-storage";

/* ───────────────────────── 陪读角色 ───────────────────────── */

export type CompanionStatus = "online" | "reading" | "idle";

export type CompanionRole = {
  id: string;
  name: string;
  /** 一句话副标题 */
  subtitle: string;
  status: CompanionStatus;
  /** data:/http(s) 图片；null 时 UI 用首字圆底占位 */
  avatar: string | null;
};

export const ROLE_STATUS_LABEL: Record<CompanionStatus, string> = {
  online: "在线",
  reading: "阅读中",
  idle: "空闲",
};

const STATUS_CYCLE: CompanionStatus[] = ["reading", "online", "idle"];

/** 无本地角色卡时的兜底 mock 陪读角色（纯演示） */
export const FALLBACK_ROLES: CompanionRole[] = [
  { id: "companion-shenye", name: "沈夜", subtitle: "安静的夜读陪伴者", status: "reading", avatar: null },
  { id: "companion-linzhi", name: "林知", subtitle: "喜欢聊句子与感受", status: "online", avatar: null },
  { id: "companion-ahe", name: "阿禾", subtitle: "温柔的共读搭子", status: "idle", avatar: null },
];

function shorten(text: string, max = 16): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "书房陪读角色";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * 陪读角色：优先使用 Float 本地角色卡（不接后端）；
 * 没有角色卡 / 读取异常时回退内置 mock。
 */
export function resolveCompanionRoles(): CompanionRole[] {
  try {
    const characters = loadCharacters();
    if (characters.length > 0) {
      return characters.slice(0, 8).map((character, index) => ({
        id: character.id,
        name: character.name,
        subtitle: shorten(character.briefPersona || character.persona || ""),
        status: STATUS_CYCLE[index % STATUS_CYCLE.length],
        avatar: character.avatar,
      }));
    }
  } catch {
    // kv-db 未水合等情况：静默回退 mock
  }
  return FALLBACK_ROLES;
}

/* ───────────────────────── 我的页 ───────────────────────── */

export const MINE_PROFILE = {
  name: "林栖",
  handle: "@linqi.reads",
  bio: "在书页之间，给自己留一间安静的房间。偏好夜读、纸感与慢节奏。",
  tags: ["夜读爱好者", "文学", "治愈系", "纸质派"],
};

export type FavoriteQuote = {
  id: string;
  text: string;
  source: string;
};

/** 收藏语录：原创短句，演示用 */
export const MOCK_QUOTES: FavoriteQuote[] = [
  { id: "quote-1", text: "夜里的灯不必太亮，够看清一句话就好。", source: "《夜读笔记》" },
  { id: "quote-2", text: "每一本被合上的书，都替我们保存了一段安静的时间。", source: "林栖" },
  { id: "quote-3", text: "风翻动书页的时候，我总觉得有人在远方应了我一声。", source: "《山茶与信》" },
];

/* ───────────────────────── 书桌页 ───────────────────────── */

export type WritingDraft = {
  id: string;
  title: string;
  kind: "短篇" | "长篇" | "角色档案" | "灵感";
  words: number;
  updated: string;
  excerpt: string;
};

export const MOCK_DRAFTS: WritingDraft[] = [
  {
    id: "draft-1",
    title: "雨季的第九封信",
    kind: "短篇",
    words: 8620,
    updated: "昨天 22:14",
    excerpt: "雨从傍晚开始下，她把信写了又停，窗外的霓虹被水汽揉成一团柔光……",
  },
  {
    id: "draft-2",
    title: "夜航人设档案",
    kind: "角色档案",
    words: 2140,
    updated: "3 天前",
    excerpt: "沈夜，二十七岁，旧书店主人。习惯在凌晨两点煮一壶茶，替留信的人保管心事……",
  },
];

/* ───────────────────────── 统计页（本地演示数据） ───────────────────────── */

export type StatsPeriod = "day" | "week" | "month" | "year";

export const STATS_PERIOD_LABEL: Record<StatsPeriod, string> = {
  day: "日",
  week: "周",
  month: "月",
  year: "年",
};

export type ReadingStatSnapshot = {
  /** 总阅读时长（分钟） */
  minutes: number;
  /** 阅读文档数 */
  docs: number;
  /** 翻页次数 */
  flips: number;
  /** 阅读字数 */
  chars: number;
};

export const READING_STATS: Record<StatsPeriod, ReadingStatSnapshot> = {
  day: { minutes: 46, docs: 1, flips: 38, chars: 23418 },
  week: { minutes: 312, docs: 3, flips: 264, chars: 186000 },
  month: { minutes: 1380, docs: 8, flips: 1170, chars: 802000 },
  year: { minutes: 16420, docs: 26, flips: 13920, chars: 9560000 },
};

/** 由字符串种子生成稳定的 0.18~1 柱状高度序列（演示图表，无随机跳动） */
export function pseudoBars(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    bars.push(0.18 + (hash % 82) / 100);
  }
  return bars;
}
