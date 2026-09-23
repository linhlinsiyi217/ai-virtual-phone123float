"use client";

import { BookstoreView } from "@/components/bookstore/bookstore-app";

type Props = { onClose: () => void };

/**
 * 「书房」App — Float 系统挂载的独立 App 根组件。
 *
 * 信息架构（Phase 1.2 固定，本轮只做命名与注释预留）：
 * BookRoomApp
 * ├── 书城 BookstoreView —— 统一内容库 / 内容发现中心（普通书 + 漫画共用内容模型，
 * │       未来扩展分类、推荐、外部内容 Provider；当前默认首页）
 * ├── 我的书架 —— 用户已收藏 / 加入 / 在读 / 已导入的内容（同样支持 book 与 manga）
 * ├── 共读 / 一起看 —— 文字内容共读（未来）
 * ├── 漫画 / 一起看漫画 —— 漫画阅读器与共看（未来；漫画内容的发现在「书城」，不做独立内容系统）
 * ├── AI 写书（未来）
 * ├── 共读记录（未来）
 * └── 广场 —— 推荐流（未来；非冷排行榜：推荐卡带来源身份，
 *         如「TA推荐 / 编辑精选 / 根据你们最近的共读推荐」，
 *         来源可来自 NPC、角色、系统编辑、未来真人用户与共读记忆）
 *
 * 打开方式概念预留：type=book → 文字阅读器（自己读 / 一起读）；
 *                   type=manga → 漫画阅读器（自己看 / 一起看漫画）。
 *
 * 以上 future 功能本轮全部不实现，也不创建空组件；当前进入书房默认直接呈现书城首页。
 */
export default function BookRoomApp({ onClose }: Props) {
  return (
    <div className="bookroom-app absolute inset-0 z-[100] flex flex-col">
      <BookstoreView onClose={onClose} />
    </div>
  );
}
