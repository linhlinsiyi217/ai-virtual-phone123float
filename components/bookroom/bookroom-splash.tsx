"use client";

import { useMemo } from "react";

/** 一滴极浅冷蓝的雨：细、慢、偶现，绝不抢字 */
type RainDrop = {
  left: number;
  delay: number;
  duration: number;
  height: number;
  opacity: number;
};

/** 固定分布，避免闪烁 / 跳动 */
const RAIN_PLAN: RainDrop[] = [
  { left: 12, delay: 0.2, duration: 2.5, height: 34, opacity: 0.1 },
  { left: 24, delay: 1.05, duration: 2.9, height: 22, opacity: 0.07 },
  { left: 38, delay: 0.55, duration: 2.3, height: 40, opacity: 0.08 },
  { left: 57, delay: 1.35, duration: 2.7, height: 26, opacity: 0.1 },
  { left: 69, delay: 0.35, duration: 2.4, height: 36, opacity: 0.07 },
  { left: 81, delay: 1.15, duration: 3.0, height: 24, opacity: 0.09 },
  { left: 90, delay: 0.75, duration: 2.6, height: 30, opacity: 0.06 },
  { left: 47, delay: 1.6, duration: 3.1, height: 20, opacity: 0.06 },
];

/**
 * 书房启动画面（Phase 8B）：
 * 纯白 × 极浅冷蓝雾气 × 零星细雨 × 轻拟态玻璃块。
 * 文字分层显现：书房 → 英文副标题 → LinH 底层水印 → @by林淮；
 * 仅 transform / opacity，可被中断，reduced-motion 下全部静态呈现。
 * 显隐与卸载仍由 BookRoomApp 控制。
 */
export function BookroomSplash() {
  const rain = useMemo(() => RAIN_PLAN, []);

  return (
    <div className="br-splash-v2" aria-label="书房启动中">
      {/* 冷蓝雾气 */}
      <span className="br-splash-mist br-splash-mist-a" aria-hidden />
      <span className="br-splash-mist br-splash-mist-b" aria-hidden />

      {/* 轻雨 */}
      <span className="br-splash-rain" aria-hidden>
        {rain.map((d, i) => (
          <span
            key={i}
            className="br-splash-drop"
            style={{
              left: `${d.left}%`,
              height: d.height,
              opacity: d.opacity,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
            }}
          />
        ))}
      </span>

      {/* 空间层次：两块非功能玻璃 */}
      <span className="br-splash-glass br-splash-glass-a" aria-hidden />
      <span className="br-splash-glass br-splash-glass-b" aria-hidden />

      {/* 底层超浅大字水印 */}
      <span className="br-splash-linh" aria-hidden>
        LinH
      </span>

      {/* 主文字组 */}
      <div className="br-splash-stack">
        <span className="br-splash-title">
          <span className="br-splash-title-char">书</span>
          <span className="br-splash-title-char">房</span>
        </span>
        <span className="br-splash-en">Where Quiet Stories Begin.</span>
      </div>

      <span className="br-splash-credit">@by林淮</span>
    </div>
  );
}
