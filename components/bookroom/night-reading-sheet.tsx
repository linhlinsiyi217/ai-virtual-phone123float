"use client";

import { useState } from "react";
import { Coffee, CloudRain, Leaf, Moon, Timer, Volume2, Waves } from "lucide-react";
import type { Book } from "@/lib/bookstore-data";
import { BottomSheet } from "./bookroom-ui";

type Props = {
  book: Book;
  /** night=书籍「夜读设置」；companion=漫画「陪伴设置」 */
  mode: "night" | "companion";
  onClose: () => void;
};

const AMBIENTS = [
  { id: "off", label: "静音", icon: Moon },
  { id: "rain", label: "雨声", icon: CloudRain },
  { id: "wave", label: "海浪", icon: Waves },
  { id: "forest", label: "森林", icon: Leaf },
  { id: "cafe", label: "咖啡厅", icon: Coffee },
] as const;

const VOICES = ["轻声女声", "沉静男声", "角色原声"];
const TIMERS = ["关闭", "15 分钟", "30 分钟", "60 分钟"];

type SliderKey = "brightness" | "fontSize" | "lineHeight";

const SLIDERS: { key: SliderKey; label: string }[] = [
  { key: "brightness", label: "背景明暗" },
  { key: "fontSize", label: "正文字号" },
  { key: "lineHeight", label: "行距" },
];

/**
 * 夜读工具半弹窗：白噪音 / 环境音、TTS 朗读、朗读声音、睡眠定时与阅读舒适度。
 * 本轮全部为本地占位交互，不接音频与真实 TTS。
 */
export function NightReadingSheet({ book, mode, onClose }: Props) {
  const [ambient, setAmbient] = useState<string>("off");
  const [tts, setTts] = useState(false);
  const [voice, setVoice] = useState(VOICES[0]);
  const [timer, setTimer] = useState(TIMERS[0]);
  const [sliders, setSliders] = useState<Record<SliderKey, number>>({
    brightness: 72,
    fontSize: 50,
    lineHeight: 58,
  });

  const title = mode === "night" ? "夜读设置" : "陪伴设置";

  return (
    <BottomSheet title={`${title} · ${book.title}`} onClose={onClose} panelClassName="br-sheet-tall">
      <section className="br-sheet-section">
        <h4 className="br-sheet-label">环境音</h4>
        <div className="br-ambient-grid">
          {AMBIENTS.map(item => {
            const Icon = item.icon;
            const active = ambient === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`br-ambient-item book-pressable ${active ? "is-active" : ""}`}
                onClick={() => setAmbient(item.id)}
                aria-pressed={active}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="br-sheet-section">
        <div className="br-switch-row">
          <span className="br-switch-label">
            <Volume2 size={16} strokeWidth={2} />
            轻声朗读（TTS）
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={tts}
            aria-label="轻声朗读开关"
            className={`br-switch book-pressable ${tts ? "is-on" : ""}`}
            onClick={() => setTts(value => !value)}
          >
            <span className="br-switch-knob" />
          </button>
        </div>
        <div className="br-chip-row" aria-disabled={!tts}>
          {VOICES.map(item => (
            <button
              key={item}
              type="button"
              disabled={!tts}
              className={`br-chip book-pressable ${voice === item ? "is-active" : ""}`}
              onClick={() => setVoice(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="br-sheet-section">
        <h4 className="br-sheet-label">
          <Timer size={15} strokeWidth={2} />
          睡眠定时
        </h4>
        <div className="br-chip-row">
          {TIMERS.map(item => (
            <button
              key={item}
              type="button"
              className={`br-chip book-pressable ${timer === item ? "is-active" : ""}`}
              onClick={() => setTimer(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="br-sheet-section">
        <h4 className="br-sheet-label">阅读舒适度</h4>
        <div className="br-slider-list">
          {SLIDERS.map(item => (
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

      <button type="button" className="br-sheet-primary book-pressable" onClick={onClose}>
        {mode === "night" ? "开始安静夜读" : "保存陪伴设置"}
      </button>
    </BottomSheet>
  );
}
