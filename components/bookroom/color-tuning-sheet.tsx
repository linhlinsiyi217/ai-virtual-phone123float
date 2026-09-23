"use client";

import { useState } from "react";
import { BottomSheet, Segmented } from "./bookroom-ui";

type Props = {
  /** 入口：外观调试默认滑杆；颜色调试默认格线 */
  initialTab: ColorTab;
  onClose: () => void;
};

type ColorTab = "grid" | "spectrum" | "sliders";

/* 格线：方块灰阶 + 极少量低饱和点缀（无圆环取色器） */
const GRID_TONES: string[] = [
  "#F7F6F3", "#EDEAE4", "#E2DED5", "#D5D0C6", "#C6C1B7", "#B5B0A6",
  "#9B968D", "#817D75", "#68655F", "#4D4B47", "#343331", "#1B1B1B",
  "#C9CDD1", "#A9B0B6", "#8A929A", "#C3B9A9",
];

/* 光谱：大面积纸 / 墨 / 雾三行 */
const SPECTRUM_ROWS: { name: string; tones: string[] }[] = [
  { name: "纸张", tones: ["#FBFAF8", "#F5F4F1", "#EDEAE4", "#E4E0D7", "#DAD5CA"] },
  { name: "墨色", tones: ["#8E8C88", "#6E6E73", "#4D4B47", "#2E2D2B", "#151515"] },
  { name: "雾灰", tones: ["#E9EBEC", "#D7DBDE", "#C2C8CD", "#A9B1B7", "#8E98A0"] },
];

const QUICK_TONES: string[] = ["#F5F4F1", "#EDEAE4", "#D5D0C6", "#B5B0A6", "#6E6E73", "#2E2D2B", "#C2C8CD", "#C3B9A9"];

type SliderKey = "lightness" | "contrast" | "radius";

const SLIDER_META: { key: SliderKey; label: string }[] = [
  { key: "lightness", label: "明暗" },
  { key: "contrast", label: "对比" },
  { key: "radius", label: "圆角" },
];

/**
 * 颜色 / 外观调试半弹窗：分段（格线 / 光谱 / 滑杆）+ 方块色块 + 快捷色 + 预览。
 * 不做圆环取色器；全部为本地调试占位，不影响真实主题。
 */
export function ColorTuningSheet({ initialTab, onClose }: Props) {
  const [tab, setTab] = useState<ColorTab>(initialTab);
  const [tone, setTone] = useState("#F5F4F1");
  const [sliders, setSliders] = useState<Record<SliderKey, number>>({
    lightness: 64,
    contrast: 52,
    radius: 58,
  });

  const isDark = ["#4D4B47", "#2E2D2B", "#343331", "#1B1B1B"].includes(tone);
  const previewStyle = {
    backgroundColor: tone,
    color: isDark ? "rgba(247,246,243,0.92)" : "#151515",
    borderRadius: `${8 + Math.round(sliders.radius / 100) * 18}px`,
    opacity: 0.55 + (sliders.lightness / 100) * 0.45,
  } as React.CSSProperties;

  return (
    <BottomSheet title="外观与颜色调试" onClose={onClose} panelClassName="br-sheet-tall">
      <Segmented<ColorTab>
        ariaLabel="颜色调试模式"
        value={tab}
        onChange={setTab}
        options={[
          { value: "grid", label: "格线" },
          { value: "spectrum", label: "光谱" },
          { value: "sliders", label: "滑杆" },
        ]}
      />

      {tab === "grid" && (
        <section className="br-sheet-section">
          <h4 className="br-sheet-label">格线取色</h4>
          <div className="br-color-grid">
            {GRID_TONES.map(item => (
              <button
                key={item}
                type="button"
                className={`br-color-cell book-pressable ${tone === item ? "is-active" : ""}`}
                style={{ backgroundColor: item }}
                onClick={() => setTone(item)}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>
        </section>
      )}

      {tab === "spectrum" && (
        <section className="br-sheet-section">
          {SPECTRUM_ROWS.map(row => (
            <div key={row.name} className="br-spectrum-row">
              <span className="br-spectrum-name">{row.name}</span>
              <span className="br-spectrum-blocks">
                {row.tones.map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`br-spectrum-cell book-pressable ${tone === item ? "is-active" : ""}`}
                    style={{ backgroundColor: item }}
                    onClick={() => setTone(item)}
                    aria-label={`${row.name} ${item}`}
                  />
                ))}
              </span>
            </div>
          ))}
        </section>
      )}

      {tab === "sliders" && (
        <section className="br-sheet-section">
          <div className="br-slider-list">
            {SLIDER_META.map(item => (
              <label key={item.key} className="br-slider-row">
                <span className="br-slider-name">{item.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliders[item.key]}
                  onChange={event =>
                    setSliders(prev => ({ ...prev, [item.key]: Number(event.target.value) }))
                  }
                  aria-label={item.label}
                  className="br-range"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="br-sheet-section">
        <h4 className="br-sheet-label">快捷色</h4>
        <div className="br-quick-row">
          {QUICK_TONES.map(item => (
            <button
              key={item}
              type="button"
              className={`br-quick-cell book-pressable ${tone === item ? "is-active" : ""}`}
              style={{ backgroundColor: item }}
              onClick={() => setTone(item)}
              aria-label={`快捷颜色 ${item}`}
            />
          ))}
        </div>
      </section>

      <section className="br-sheet-section">
        <h4 className="br-sheet-label">预览</h4>
        <div className="br-color-preview book-glass">
          <div className="br-color-preview-card" style={previewStyle}>
            <span className="br-color-preview-title">书房阅读卡</span>
            <span className="br-color-preview-line" />
            <span className="br-color-preview-line br-color-preview-line-short" />
          </div>
        </div>
        <p className="br-color-note">调试仅在本地预览，不会改动 Float 全局外观。</p>
      </section>
    </BottomSheet>
  );
}
