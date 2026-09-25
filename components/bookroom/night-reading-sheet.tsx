"use client";

import { useState } from "react";
import { Coffee, CloudRain, Leaf, Moon, Timer, Volume2, Waves } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { BottomSheet, Segmented } from "./bookroom-ui";
import {
  loadReaderPrefs,
  saveBookReaderPrefs,
  saveDefaultReaderPrefs,
  clearBookReaderPrefs,
  hasBookReaderPrefs,
  READER_PAPERS,
  type ReaderPrefs,
  type ReaderPaperId,
  type ReaderPageMotion,
  type ReaderFontFamily,
} from "@/lib/bookroom-reader-prefs";
import {
  playAmbient,
  stopAmbient,
  setAmbientVolume,
  isTtsAvailable,
  setSleepTimer,
  clearSleepTimer,
  type AmbientId,
} from "@/lib/bookroom-audio";

type Props = {
  book: Book;
  /** night=书籍「阅读外观 / 夜读」；companion=漫画「陪伴设置」（仅夜读页签） */
  mode: "night" | "companion";
  onClose: () => void;
};

const AMBIENTS: { id: AmbientId; label: string; icon: typeof Moon }[] = [
  { id: "off", label: "静音", icon: Moon },
  { id: "rain", label: "雨声", icon: CloudRain },
  { id: "wave", label: "海浪", icon: Waves },
  { id: "forest", label: "森林", icon: Leaf },
  { id: "cafe", label: "咖啡厅", icon: Coffee },
];

const TIMERS: { value: number; label: string }[] = [
  { value: 0, label: "关闭" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "60 分钟" },
];

const FONT_OPTIONS: { value: ReaderFontFamily; label: string }[] = [
  { value: "system", label: "系统默认" },
  { value: "serif", label: "衬线" },
  { value: "sans", label: "黑体" },
];

const MOTION_OPTIONS: { value: ReaderPageMotion; label: string }[] = [
  { value: "scroll", label: "滚动" },
  { value: "fade", label: "淡入翻页" },
  { value: "flip", label: "轻拟真翻页" },
];

type SheetTab = "typo" | "paper" | "night";

function PrefsSlider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`br-slider-row${props.disabled ? " is-disabled" : ""}`}>
      <span className="br-slider-name">{props.label}</span>
      <input
        type="range"
        className="br-range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={event => props.onChange(Number(event.target.value))}
        aria-label={props.label}
      />
      <span className="br-slider-val">{props.display}</span>
    </label>
  );
}

function PrefsSwitch(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="br-switch-row">
      <span className="br-switch-label">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        className={`br-switch book-pressable ${props.checked ? "is-on" : ""}`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="br-switch-knob" />
      </button>
    </div>
  );
}

/**
 * 阅读外观工作室（Phase 9A P1，由「夜读设置」升级）：
 * 排版 / 纸底 / 夜读三页签；改动即时持久化（单本书层），可「设为默认」沉淀到全局。
 * 环境音为 Web Audio 真实合成；TTS 不可用时诚实显示，不假装能读。
 */
export function NightReadingSheet({ book, mode, onClose }: Props) {
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => loadReaderPrefs(book.id));
  const [tab, setTab] = useState<SheetTab>(mode === "companion" ? "night" : "typo");
  const [hint, setHint] = useState<string | null>(null);
  const [hasBookOverride, setHasBookOverride] = useState(() => hasBookReaderPrefs(book.id));
  const ttsAvailable = isTtsAvailable();

  const flash = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 1600);
  };

  /** 统一更新入口：即时保存到单本书层，音频类改动同步到真实播放 */
  const update = (patch: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveBookReaderPrefs(book.id, next);
    setHasBookOverride(true);
    if (patch.ambientId !== undefined || patch.ambientVolume !== undefined) {
      if (next.ambientId === "off") {
        stopAmbient();
      } else if (patch.ambientId !== undefined) {
        playAmbient(next.ambientId, next.ambientVolume / 100);
      } else {
        setAmbientVolume(next.ambientVolume / 100);
      }
    }
    if (patch.sleepTimer !== undefined) {
      if (patch.sleepTimer > 0) setSleepTimer(patch.sleepTimer);
      else clearSleepTimer();
    }
  };

  const handleSetDefault = () => {
    saveDefaultReaderPrefs(prefs);
    flash("已设为全局默认，新书将继承这套外观");
  };

  const handleClearBook = () => {
    clearBookReaderPrefs(book.id);
    setPrefs(loadReaderPrefs(book.id));
    setHasBookOverride(false);
    flash("已恢复为全局默认");
  };

  const title = mode === "night" ? "阅读外观" : "陪伴设置";

  return (
    <BottomSheet title={`${title} · ${book.title}`} onClose={onClose} panelClassName="br-sheet-tall">
      {mode === "night" && (
        <Segmented<SheetTab>
          ariaLabel="阅读外观分类"
          value={tab}
          onChange={setTab}
          options={[
            { value: "typo", label: "排版" },
            { value: "paper", label: "纸底" },
            { value: "night", label: "夜读" },
          ]}
        />
      )}

      {/* ── 排版 ── */}
      {tab === "typo" && mode === "night" && (
        <>
          <section className="br-sheet-section">
            <div className="br-slider-list">
              <PrefsSlider label="正文字号" min={14} max={24} step={0.5} value={prefs.fontSize}
                display={`${prefs.fontSize.toFixed(1)}px`} onChange={v => update({ fontSize: v })} />
              <PrefsSlider label="行距" min={1.4} max={2.6} step={0.05} value={prefs.lineHeight}
                display={prefs.lineHeight.toFixed(2)} onChange={v => update({ lineHeight: v })} />
              <PrefsSlider label="段距" min={0.4} max={2.4} step={0.1} value={prefs.paragraphSpacing}
                display={`${prefs.paragraphSpacing.toFixed(1)}em`} onChange={v => update({ paragraphSpacing: v })} />
              <PrefsSlider label="页边距" min={12} max={48} step={1} value={prefs.paddingX}
                display={`${Math.round(prefs.paddingX)}px`} onChange={v => update({ paddingX: v })} />
              <PrefsSlider label="正文宽度" min={78} max={100} step={1} value={prefs.textWidth}
                display={`${Math.round(prefs.textWidth)}%`} onChange={v => update({ textWidth: v })} />
              <PrefsSlider label="字重" min={300} max={700} step={20} value={prefs.fontWeight}
                display={String(Math.round(prefs.fontWeight))} onChange={v => update({ fontWeight: v })} />
            </div>
          </section>
          <section className="br-sheet-section">
            <h4 className="br-sheet-label">字体</h4>
            <div className="br-chip-row">
              {FONT_OPTIONS.map(item => (
                <button key={item.value} type="button"
                  className={`br-chip book-pressable ${prefs.fontFamily === item.value ? "is-active" : ""}`}
                  onClick={() => update({ fontFamily: item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
          </section>
          <section className="br-sheet-section">
            <PrefsSwitch label="首行缩进" checked={prefs.indentFirstLine}
              onChange={v => update({ indentFirstLine: v })} />
            <PrefsSwitch label="两端对齐" checked={prefs.justify}
              onChange={v => update({ justify: v })} />
          </section>
        </>
      )}

      {/* ── 纸底 ── */}
      {tab === "paper" && mode === "night" && (
        <>
          <section className="br-sheet-section">
            <h4 className="br-sheet-label">主题纸底</h4>
            <div className="br-paper-grid">
              {(Object.keys(READER_PAPERS) as ReaderPaperId[]).map(id => {
                const paper = READER_PAPERS[id];
                const active = prefs.paper === id;
                return (
                  <button key={id} type="button"
                    className={`br-paper-card book-pressable ${active ? "is-active" : ""}`}
                    onClick={() => update({ paper: id })}
                    aria-pressed={active}>
                    <span className="br-paper-swatch" style={{ background: paper.bg }}>
                      <span className="br-paper-swatch-line" style={{ background: paper.text }} />
                      <span className="br-paper-swatch-line is-short" style={{ background: paper.text }} />
                    </span>
                    <span className="br-paper-name">{paper.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="br-sheet-section">
            <div className="br-slider-list">
              <PrefsSlider label="背景明暗" min={40} max={100} step={1} value={prefs.brightness}
                display={`${Math.round(prefs.brightness)}%`} onChange={v => update({ brightness: v })} />
              <PrefsSlider label="纸张纹理" min={0} max={100} step={5} value={prefs.textureStrength}
                display={prefs.textureStrength === 0 ? "无" : `${Math.round(prefs.textureStrength)}%`}
                onChange={v => update({ textureStrength: v })} />
            </div>
          </section>
          <section className="br-sheet-section">
            <h4 className="br-sheet-label">翻页模式</h4>
            <div className="br-chip-row">
              {MOTION_OPTIONS.map(item => (
                <button key={item.value} type="button"
                  className={`br-chip book-pressable ${prefs.pageMotion === item.value ? "is-active" : ""}`}
                  onClick={() => update({ pageMotion: item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── 夜读 ── */}
      {tab === "night" && (
        <>
          <section className="br-sheet-section">
            <h4 className="br-sheet-label">环境音</h4>
            <div className="br-ambient-grid">
              {AMBIENTS.map(item => {
                const Icon = item.icon;
                const active = prefs.ambientId === item.id;
                return (
                  <button key={item.id} type="button"
                    className={`br-ambient-item book-pressable ${active ? "is-active" : ""}`}
                    onClick={() => update({ ambientId: item.id })}
                    aria-pressed={active}>
                    <Icon size={18} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="br-slider-list">
              <PrefsSlider label="白噪音音量" min={0} max={100} step={1} value={prefs.ambientVolume}
                display={`${Math.round(prefs.ambientVolume)}%`} disabled={prefs.ambientId === "off"}
                onChange={v => update({ ambientVolume: v })} />
            </div>
          </section>

          <section className="br-sheet-section">
            <PrefsSwitch
              label="轻声朗读（TTS）"
              checked={prefs.ttsEnabled && ttsAvailable}
              disabled={!ttsAvailable}
              onChange={v => update({ ttsEnabled: v })}
            />
            {!ttsAvailable && (
              <p className="br-sheet-note">朗读能力准备中 · 当前设备不可用</p>
            )}
            <div className="br-slider-list">
              <PrefsSlider label="朗读音量" min={0} max={100} step={1} value={prefs.ttsVolume}
                display={`${Math.round(prefs.ttsVolume)}%`} disabled={!ttsAvailable || !prefs.ttsEnabled}
                onChange={v => update({ ttsVolume: v })} />
            </div>
            <p className="br-sheet-note">
              <Volume2 size={12} strokeWidth={2} />
              朗读音量与环境音相互独立；长按正文「从此听」开始朗读
            </p>
          </section>

          <section className="br-sheet-section">
            <h4 className="br-sheet-label">
              <Timer size={15} strokeWidth={2} />
              睡眠定时
            </h4>
            <div className="br-chip-row">
              {TIMERS.map(item => (
                <button key={item.value} type="button"
                  className={`br-chip book-pressable ${prefs.sleepTimer === item.value ? "is-active" : ""}`}
                  onClick={() => update({ sleepTimer: item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
            {prefs.sleepTimer > 0 && (
              <p className="br-sheet-note">{prefs.sleepTimer} 分钟后自动停止朗读与环境音</p>
            )}
          </section>
        </>
      )}

      {/* ── 底部：持久化操作 ── */}
      <div className="br-sheet-footer-row">
        <button type="button" className="br-sheet-secondary book-pressable" onClick={handleSetDefault}>
          设为默认
        </button>
        {hasBookOverride && (
          <button type="button" className="br-sheet-secondary book-pressable" onClick={handleClearBook}>
            恢复全局
          </button>
        )}
      </div>
      {hint && <p className="br-sheet-hint">{hint}</p>}

      <button type="button" className="br-sheet-primary book-pressable" onClick={onClose}>
        完成
      </button>
    </BottomSheet>
  );
}
