/**
 * 书城（Bookstore）— 书房内的「统一内容库 / 内容发现中心」。
 *
 * 信息架构（Phase 1.2 固定）：
 * - 书城承载的是「阅读内容」，不是普通书专属页面；
 *   普通书（book）与漫画（manga）共用同一份内容模型与发现/搜索/详情流程。
 * - 未来可继续扩展：分类、推荐、外部内容 Provider（本文件不做 Provider 系统）。
 * - 「我的书架」是另一个概念：用户已收藏 / 加入 / 在读 / 已导入的内容，
 *   同样同时支持 book 与 manga，用 inShelf 标记（Phase 1.2 仅占位，无持久化）。
 *
 * 本文件只有本地 Mock 数据，不接任何在线书源；
 * 封面走设计感 Placeholder（BookCover 按 coverTone 渲染）。
 */

import { CAMELLIA_CHAPTERS, NORWEGIAN_WOOD_CHAPTERS } from "./bookstore-mock-chapters";
import { buildMangaPages } from "./bookstore-mock-manga";

/** 漫画单页：src 为自制分镜 SVG（data: URL），caption 为可选页说明 */
export type MangaPage = {
  id: string;
  src: string;
  caption?: string;
};

/** 内容类型：普通书 → 未来文字阅读器（自己读 / 一起读）；漫画 → 未来漫画阅读器（自己看 / 一起看漫画） */
export type BookContentType = "book" | "manga";

/** 内容来源：本地 / 内置 / 外部 Provider。Phase 1.2 仅字段预留，不接 API。 */
export type BookContentSource = "local" | "builtin" | "external";

/** 可读状态（Phase 4A）：决定详情页按钮文案与是否可进入 ReadingView */
export type BookAccessMode = "full" | "preview" | "metadata-only" | "external";

export type BookCoverTone =
  | "paper" // 奶白纸张
  | "blue" // 灰蓝
  | "gold" // 纸张黄
  | "clay" // 暗红
  | "ink" // 炭灰
  | "warm"; // 暖灰

/**
 * 书房统一内容条目：普通书与漫画共用此结构，不做两套割裂的数据系统。
 */
export type BookChapter = {
  id: string;
  title: string;
  /** 章节正文（按段落分隔，阅读器逐段排版）；Phase 2A 仅本地 mock 原创测试文本 */
  content: string[];
};

export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  /** 内容类型：普通书 / 漫画 */
  type: BookContentType;
  description: string;
  /** 阅读进度 0-100，无进度表示未开始 */
  progress?: number;
  /** 是否在我的书架（已收藏 / 在读 / 已导入） */
  inShelf?: boolean;
  coverTone: BookCoverTone;
  /** 来源预留：缺省按内置 Mock 处理 */
  source?: BookContentSource;
  /** 普通书的本地 mock 章节 */
  chapters?: BookChapter[];
  /** 漫画的本地 mock 分镜页（Phase 2B：纵向连续滚动阅读） */
  pages?: MangaPage[];
  /** Phase 4A：在线结果真实封面 URL（有值时优先于 coverTone 渲染） */
  coverUrl?: string;
  /** Phase 4A：在线来源信息（provider 名 + provider 内部 ID + 全文标识） */
  externalId?: { provider: string; id: string; fullTextId?: string };
  /** Phase 4A：可读状态（在线结果用，决定按钮文案） */
  access?: { mode: BookAccessMode; url?: string };
  /** Phase 4A：出版信息（在线详情页展示） */
  publishedDate?: string;
  publisher?: string;
  language?: string;
  isbn?: string[];
};

export const MOCK_BOOKS: Book[] = [
  {
    id: "norwegian-wood",
    title: "挪威的森林",
    author: "村上春树",
    category: "小说",
    type: "book",
    description:
      "渡边在直子与绿子之间徘徊，青春的迷惘与失去如森林般幽深。一部关于记忆、爱与告别的长篇小说。",
    progress: 37,
    inShelf: true,
    coverTone: "clay",
    source: "builtin",
    chapters: NORWEGIAN_WOOD_CHAPTERS,
  },
  {
    id: "moon-and-sixpence",
    title: "月亮与六便士",
    author: "毛姆",
    category: "文学",
    type: "book",
    description:
      "证券经纪人抛下一切奔赴绘画理想，在满地六便士里抬头望月。毛姆以冷峻笔调书写理想与生活的两难。",
    inShelf: true,
    coverTone: "blue",
    source: "builtin",
  },
  {
    id: "camellia-stationery",
    title: "山茶文具店",
    author: "小川糸",
    category: "治愈",
    type: "book",
    description:
      "镰仓的代笔人雨宫鸠子，替人写下无法说出口的心事。一封封信笺里，藏着温柔的生活与和解。",
    inShelf: true,
    coverTone: "gold",
    source: "builtin",
    chapters: CAMELLIA_CHAPTERS,
  },
  {
    id: "ren-ren-cao-mu",
    title: "人间草木",
    author: "汪曾祺",
    category: "随笔",
    type: "book",
    description:
      "草木虫鱼、四方食事、故人往事。汪曾祺以淡而有味的文字，写尽人间烟火里的从容与深情。",
    inShelf: false,
    coverTone: "paper",
    source: "builtin",
  },
  {
    id: "little-prince",
    title: "小王子",
    author: "圣埃克苏佩里",
    category: "童话",
    type: "book",
    description:
      "来自 B-612 星球的小王子游历诸星，最终在玫瑰与狐狸身上懂得驯养与责任。写给大人的童话。",
    inShelf: false,
    coverTone: "ink",
    source: "builtin",
  },
  {
    id: "me-and-ditan",
    title: "我与地坛",
    author: "史铁生",
    category: "散文",
    type: "book",
    description:
      "摇着轮椅的十五年，史铁生在地坛的荒芜里与命运对谈。关于生死、母爱与写作的沉思之作。",
    inShelf: false,
    coverTone: "warm",
    source: "builtin",
  },
  {
    id: "blue-period",
    title: "蓝色时期",
    author: "山口飞翔",
    category: "漫画",
    type: "manga",
    description:
      "成绩优秀却找不到热爱的矢口八虎，在一幅画前被击中，从此一头栽进美术的世界。关于创作、迷惘与自我的青春漫画。",
    inShelf: false,
    coverTone: "blue",
    source: "builtin",
    pages: buildMangaPages("blue-period", "蓝色时期", 10),
  },
  {
    id: "skip-and-loafer",
    title: "跃动青春",
    author: "高松美咲",
    category: "漫画",
    type: "manga",
    description:
      "从乡下来到东京读高中的美津未，与同学们在错位与真诚中一起长大。明亮又细腻的校园群像漫画。",
    inShelf: false,
    coverTone: "gold",
    source: "builtin",
    pages: buildMangaPages("skip-and-loafer", "跃动青春", 10),
  },
];
