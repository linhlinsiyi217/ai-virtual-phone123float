"use client";

import { useEffect, useState } from "react";
import {
  CloudMoon,
  CloudRain,
  Coffee,
  Droplets,
  Fan,
  Flame,
  Leaf,
  Library,
  Moon,
  Timer,
  Train,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import {
  getBookTtsVoices,
  onBookTtsVoicesChanged,
  type BookTtsVoice,
} from "@/lib/bookroom-tts";
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
  type ReaderBgMode,
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
  { id: "night-rain", label: "夜雨窗边", icon: CloudMoon },
  { id: "wave", label: "海浪", icon: Waves },
  { id: "forest", label: "森林", icon: Leaf },
  { id: "river", label: "河流", icon: Droplets },
  { id: "fireplace", label: "壁炉", icon: Flame },
  { id: "cafe", label: "咖啡馆", icon: Coffee },
  { id: "library", label: "图书馆", icon: Library },
  { id: "fan", label: "风扇", icon: Fan },
  { id: "wind", label: "轻风", icon: Wind },
  { id: "train", label: "火车远行", icon: Train },
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

const BG_MODE_OPTIONS: { value: ReaderBgMode; label: string }[] = [
  { value: "solid", label: "纯色" },
  { value: "gradient", label: "渐变" },
  { value: "image", label: "自定义图片" },
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
  const [voices, setVoices] = useState<BookTtsVoice[]>(() => (ttsAvailable ? getBookTtsVoices() : []));
  const [voiceFilter, setVoiceFilter] = useState<"all" | "female" | "male">("all");

  /* 部分引擎（Chrome）首次音色列表为空，voiceschanged 后刷新 */
  useEffect(() => {
    if (!ttsAvailable) return;
    setVoices(getBookTtsVoices());
    return onBookTtsVoicesChanged(() => setVoices(getBookTtsVoices()));
  }, [ttsAvailable]);

  const visibleVoices = voices.filter(v => voiceFilter === "all" || v.gender === voiceFilter);

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
              <PrefsSlider label="字距" min={-0.5} max={3} step={0.1} value={prefs.letterSpacing}
                display={`${prefs.letterSpacing.toFixed(1)}px`} onChange={v => update({ letterSpacing: v })} />
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
            <PrefsSwitch label="段落间空行" checked={prefs.paragraphBlank}
              onChange={v => update({ paragraphBlank: v })} />
          </section>
        </>
      )}

      {/* ── 纸底 ── */}
      {tab === "paper" && mode === "night" && (
        <>
          <section className="br-sheet-section">
            <h4 className="br-sheet-label">纸底模式</h4>
            <div className="br-chip-row">
              {BG_MODE_OPTIONS.map(item => (
                <button key={item.value} type="button"
                  className={`br-chip book-pressable ${prefs.bgMode === item.value ? "is-active" : ""}`}
                  onClick={() => update({ bgMode: item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
            {prefs.bgMode === "image" && (
              <>
                <div className="br-bg-image-row">
                  <input
                    type="url"
                    className="br-bg-image-input"
                    placeholder="粘贴图片链接，或选择本地图片"
                    value={prefs.bgImageUrl.startsWith("data:") ? "" : prefs.bgImageUrl}
                    onChange={event => update({ bgImageUrl: event.target.value.trim() })}
                    aria-label="背景图片链接"
                  />
                  <label className="br-sheet-secondary book-pressable br-bg-image-upload">
                    上传
                    <input
                      type="file"
                      accept="image/*"
                      className="br-visually-hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 3 * 1024 * 1024) {
                          flash("图片请控制在 3MB 以内");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") update({ bgImageUrl: reader.result });
                        };
                        reader.readAsDataURL(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {prefs.bgImageUrl && (
                  <p className="br-sheet-note">
                    {prefs.bgImageUrl.startsWith("data:") ? "已使用本地上传的图片" : "已使用图片链接"}，建议配合背景模糊提升文字可读性
                  </p>
                )}
              </>
            )}
          </section>
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
              <PrefsSlider label="背景饱和度" min={40} max={180} step={5} value={prefs.bgSaturation}
                display={`${Math.round(prefs.bgSaturation)}%`} disabled={prefs.bgMode === "solid"}
                onChange={v => update({ bgSaturation: v })} />
              <PrefsSlider label="背景模糊" min={0} max={16} step={1} value={prefs.bgBlur}
                display={`${Math.round(prefs.bgBlur)}px`} disabled={prefs.bgMode === "solid"}
                onChange={v => update({ bgBlur: v })} />
              <PrefsSlider label="文字对比度" min={60} max={130} step={5} value={prefs.textContrast}
                display={`${Math.round(prefs.textContrast)}%`} onChange={v => update({ textContrast: v })} />
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
            {ttsAvailable && voices.length === 0 && (
              <p className="br-sheet-note">当前设备暂无可用朗读音色</p>
            )}
            {ttsAvailable && voices.length > 0 && (
              <div className="br-voice-picker">
                <div className="br-voice-filter-row">
                  {([
                    { value: "all", label: "全部" },
                    { value: "female", label: "女声" },
                    { value: "male", label: "男声" },
                  ] as const).map(item => (
                    <button key={item.value} type="button"
                      className={`br-chip br-chip-mini book-pressable ${voiceFilter === item.value ? "is-active" : ""}`}
                      onClick={() => setVoiceFilter(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="br-chip-row">
                  <button type="button"
                    className={`br-chip book-pressable ${!prefs.ttsVoiceURI ? "is-active" : ""}`}
                    disabled={!prefs.ttsEnabled}
                    onClick={() => update({ ttsVoiceURI: "" })}>
                    系统默认
                  </button>
                  {visibleVoices.map(v => (
                    <button key={v.uri} type="button"
                      className={`br-chip book-pressable ${prefs.ttsVoiceURI === v.uri ? "is-active" : ""}`}
                      disabled={!prefs.ttsEnabled}
                      onClick={() => update({ ttsVoiceURI: v.uri })}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="br-slider-list">
              <PrefsSlider label="朗读音量" min={0} max={100} step={1} value={prefs.ttsVolume}
                display={`${Math.round(prefs.ttsVolume)}%`} disabled={!ttsAvailable || !prefs.ttsEnabled}
                onChange={v => update({ ttsVolume: v })} />
              <PrefsSlider label="朗读速度" min={0.5} max={2} step={0.05} value={prefs.ttsRate}
                display={`${prefs.ttsRate.toFixed(2)}×`} disabled={!ttsAvailable || !prefs.ttsEnabled}
                onChange={v => update({ ttsRate: v })} />
              <PrefsSlider label="朗读音高" min={0.5} max={2} step={0.05} value={prefs.ttsPitch}
                display={`${prefs.ttsPitch.toFixed(2)}`} disabled={!ttsAvailable || !prefs.ttsEnabled}
                onChange={v => update({ ttsPitch: v })} />
            </div>
            <PrefsSwitch label="高亮当前朗读段落" checked={prefs.highlightSpeaking}
              disabled={!ttsAvailable || !prefs.ttsEnabled}
              onChange={v => update({ highlightSpeaking: v })} />
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

      {/* ── 底部：持久化操作（改动即时作用于本书；此处管理全局默认） ── */}
      <div className="br-sheet-footer-row">
        <button type="button" className="br-sheet-secondary book-pressable" onClick={handleSetDefault}>
          设为所有书默认
        </button>
        {hasBookOverride && (
          <button type="button" className="br-sheet-secondary book-pressable" onClick={handleClearBook}>
            本书恢复默认
          </button>
        )}
      </div>
      <p className="br-sheet-note">以上调整即时应用到本书；「设为所有书默认」后新书将继承这套外观</p>
      {hint && <p className="br-sheet-hint">{hint}</p>}

      <button type="button" className="br-sheet-primary book-pressable" onClick={onClose}>
        完成
      </button>
    </BottomSheet>
  );
}
