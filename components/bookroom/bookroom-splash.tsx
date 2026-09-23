"use client";

import { BookOpenText } from "lucide-react";

/**
 * 书房启动画面：奶白雾底 + 一张悬浮玻璃阅读卡 + 细进度条。
 * 仅静态结构与轻柔动效；显隐 / 卸载由 BookRoomApp 控制。
 */
export function BookroomSplash() {
  return (
    <div className="br-splash" aria-label="书房启动中">
      <div className="br-splash-card book-glass">
        <span className="br-splash-mark" aria-hidden>
          <BookOpenText size={26} strokeWidth={1.7} />
        </span>
        <span className="br-splash-name">书房</span>
        <span className="br-splash-sub">留一点时间给文字</span>
        <span className="br-splash-track" aria-hidden>
          <span className="br-splash-fill" />
        </span>
      </div>
    </div>
  );
}
