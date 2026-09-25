"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { BottomSheet, Segmented, BrToast } from "./bookroom-ui";
import {
  APPEARANCE_PRESETS,
  applyAppearancePreset,
  buildAppearanceCss,
  loadBookroomAppearance,
  updateAppearanceTokens,
  type AppearancePresetId,
  type AppearanceTokens,
} from "@/lib/bookroom-appearance";

type Props = {
  onClose: () => void;
};

type Tab = "presets" | "tokens" | "colors";

const COLOR_SWATCHES = [
  "#3B82F6", "#EF4444", "#F59E0B", "#10B981",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
  "#6366F1", "#F97316", "#14B8A6", "#A855F7",
];

const SLIDER_META: { key: keyof AppearanceTokens; label: string; min: number; max: number }[] = [
  { key: "cardOpacity", label: "卡片透明度", min: 0, max: 100 },
  { key: "cardBlur", label: "卡片模糊", min: 0, max: 40 },
  { key: "cardShadow", label: "卡片阴影", min: 0, max: 100 },
  { key: "borderBrightness", label: "边框亮度", min: 0, max: 100 },
  { key: "radius", label: "圆角", min: 0, max: 24 },
  { key: "glassHighlight", label: "玻璃高光", min: 0, max: 100 },
];

/** 色块矩阵选择器 */
function ColorMatrix({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="br-color-matrix">
      {COLOR_SWATCHES.map(color => (
        <button
          key={color}
          type="button"
          className={`br-color-cell book-pressable ${value === color ? "is-active" : ""}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`选择 ${color}`}
        />
      ))}
    </div>
  );
}

/** 外观工作室：统一外观设置 */
export function AppearanceStudioSheet({ onClose }: Props) {
  const [appearance, setAppearance] = useState(() => loadBookroomAppearance());
  const [tab, setTab] = useState<Tab>("presets");
  const [toast, setToast] = useState<string | null>(null);

  // 实时应用 CSS 变量
  useEffect(() => {
    const styleId = "br-appearance-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildAppearanceCss(appearance.tokens, appearance.presetId);
    return () => {
      // 组件卸载时不移除，保持外观
    };
  }, [appearance.tokens, appearance.presetId]);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1500);
  };

  const handlePreset = (id: AppearancePresetId) => {
    setAppearance(applyAppearancePreset(id));
    showToast(`已切换到 ${APPEARANCE_PRESETS.find(p => p.id === id)?.name}`);
  };

  const handleTokenChange = (patch: Partial<AppearanceTokens>) => {
    setAppearance(updateAppearanceTokens(patch));
  };

  const handleColorChange = (key: keyof AppearanceTokens, value: string) => {
    handleTokenChange({ [key]: value });
  };

  return (
    <BottomSheet title="外观工作室" onClose={onClose} panelClassName="br-sheet-tall">
      <Segmented<Tab>
        ariaLabel="外观设置"
        value={tab}
        onChange={setTab}
        options={[
          { value: "presets", label: "预设" },
          { value: "tokens", label: "调节" },
          { value: "colors", label: "色彩" },
        ]}
      />

      {tab === "presets" && (
        <section className="br-sheet-section">
          <div className="br-preset-grid">
            {APPEARANCE_PRESETS.map(preset => {
              const active = appearance.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`br-preset-card book-pressable ${active ? "is-active" : ""}`}
                  onClick={() => handlePreset(preset.id)}
                >
                  <span className="br-preset-swatch" style={{ background: preset.tokens.bgPrimary }}>
                    <span className="br-preset-swatch-accent" style={{ background: preset.tokens.accent }} />
                  </span>
                  <span className="br-preset-name">{preset.name}</span>
                  <span className="br-preset-desc">{preset.description}</span>
                  {active && <Check size={16} className="br-preset-check" />}
                </button>
              );
            })}
          </div>
          <p className="br-sheet-note">选择预设后仍可在「调节」和「色彩」中微调。</p>
        </section>
      )}

      {tab === "tokens" && (
        <section className="br-sheet-section">
          <div className="br-slider-list">
            {SLIDER_META.map(item => (
              <label key={item.key} className="br-slider-row">
                <span className="br-slider-name">{item.label}</span>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  value={appearance.tokens[item.key] as number}
                  onChange={e => handleTokenChange({ [item.key]: Number(e.target.value) })}
                  className="br-range"
                  aria-label={item.label}
                />
                <span className="br-slider-value">{appearance.tokens[item.key]}</span>
              </label>
            ))}
          </div>

          <div className="br-mode-toggle">
            <button
              type="button"
              className={`br-mode-btn book-pressable ${appearance.tokens.mode === "light" ? "is-active" : ""}`}
              onClick={() => handleTokenChange({ mode: "light" })}
            >
              <Sun size={16} />
              浅色
            </button>
            <button
              type="button"
              className={`br-mode-btn book-pressable ${appearance.tokens.mode === "dark" ? "is-active" : ""}`}
              onClick={() => handleTokenChange({ mode: "dark" })}
            >
              <Moon size={16} />
              深色
            </button>
          </div>
        </section>
      )}

      {tab === "colors" && (
        <section className="br-sheet-section">
          <div className="br-color-fields">
            <div className="br-color-field">
              <span className="br-field-label">主背景</span>
              <ColorMatrix value={appearance.tokens.bgPrimary} onChange={v => handleColorChange("bgPrimary", v)} />
            </div>
            <div className="br-color-field">
              <span className="br-field-label">次背景</span>
              <ColorMatrix value={appearance.tokens.bgSecondary} onChange={v => handleColorChange("bgSecondary", v)} />
            </div>
            <div className="br-color-field">
              <span className="br-field-label">文字主色</span>
              <ColorMatrix value={appearance.tokens.textPrimary} onChange={v => handleColorChange("textPrimary", v)} />
            </div>
            <div className="br-color-field">
              <span className="br-field-label">文字次色</span>
              <ColorMatrix value={appearance.tokens.textSecondary} onChange={v => handleColorChange("textSecondary", v)} />
            </div>
            <div className="br-color-field">
              <span className="br-field-label">强调色（小面积）</span>
              <ColorMatrix value={appearance.tokens.accent} onChange={v => handleColorChange("accent", v)} />
            </div>
          </div>
          <p className="br-sheet-note">强调色仅用于进度、状态、高亮等小面积元素。</p>
        </section>
      )}

      <BrToast text={toast} />
    </BottomSheet>
  );
}
