/**
 * 书房「夜读音频层」— 环境音（Web Audio 真实合成）+ TTS 能力状态 + 睡眠定时。
 *
 * - 环境音不依赖任何音频资源文件：噪声 Buffer + 滤波器实时合成，
 *   雨声 / 海浪 / 森林 / 咖啡厅四种，体积小、完全离线、真实可听。
 * - TTS 预留 provider 架构：当前桥接浏览器 SpeechSynthesis 可用性，
 *   后续可在此接入 Piper / Kokoro 等本地引擎；不可用时 UI 必须诚实显示。
 * - 环境音音量与 TTS 音量完全分离。
 */

import { isBookTtsSupported } from "./bookroom-tts";

export type AmbientId = "off" | "rain" | "wave" | "forest" | "cafe";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeId: AmbientId = "off";
let activeVolume = 0.5;
let stopCurrentSource: (() => void) | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** 生成 2 秒循环噪声 Buffer：white=白噪声，brown=布朗噪声（低频更厚、更柔） */
function makeNoiseBuffer(audio: AudioContext, kind: "white" | "brown"): AudioBuffer {
  const length = audio.sampleRate * 2;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (kind === "white") {
      data[i] = white * 0.6;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
  }
  return buffer;
}

type AmbientSpec = {
  noise: "white" | "brown";
  filterType: BiquadFilterType;
  frequency: number;
  q?: number;
  /** 基础响度（乘用户音量） */
  gain: number;
  /** 海浪：超低频 LFO 调制增益，模拟潮水起伏 */
  lfo?: { frequency: number; depth: number };
};

const AMBIENT_SPECS: Record<Exclude<AmbientId, "off">, AmbientSpec> = {
  rain: { noise: "white", filterType: "bandpass", frequency: 1800, q: 0.55, gain: 0.42 },
  wave: { noise: "brown", filterType: "lowpass", frequency: 400, gain: 0.85, lfo: { frequency: 0.08, depth: 0.45 } },
  forest: { noise: "white", filterType: "highpass", frequency: 2500, gain: 0.1 },
  cafe: { noise: "brown", filterType: "lowpass", frequency: 600, gain: 0.5 },
};

/** 播放环境音（全局单例：切音即停旧音）；volume 0-1 */
export function playAmbient(id: AmbientId, volume = 0.5): void {
  stopAmbient();
  activeVolume = Math.min(1, Math.max(0, volume));
  if (id === "off") {
    activeId = "off";
    return;
  }
  const audio = ensureContext();
  if (!audio) {
    activeId = "off";
    return;
  }
  const spec = AMBIENT_SPECS[id];
  const source = audio.createBufferSource();
  source.buffer = makeNoiseBuffer(audio, spec.noise);
  source.loop = true;

  const filter = audio.createBiquadFilter();
  filter.type = spec.filterType;
  filter.frequency.value = spec.frequency;
  if (spec.q) filter.Q.value = spec.q;

  const gain = audio.createGain();
  // 淡入，避免爆音
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, spec.gain * activeVolume), audio.currentTime + 0.6);

  source.connect(filter);
  filter.connect(gain);

  let lfo: OscillatorNode | null = null;
  if (spec.lfo) {
    lfo = audio.createOscillator();
    lfo.frequency.value = spec.lfo.frequency;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = spec.gain * activeVolume * spec.lfo.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
  }

  gain.connect(audio.destination);
  masterGain = gain;
  activeId = id;
  source.start();
  stopCurrentSource = () => {
    try { source.stop(); } catch { /* 已停止 */ }
    if (lfo) { try { lfo.stop(); } catch { /* 已停止 */ } }
  };
}

export function stopAmbient(): void {
  stopCurrentSource?.();
  stopCurrentSource = null;
  if (masterGain) {
    try { masterGain.disconnect(); } catch { /* 已断开 */ }
    masterGain = null;
  }
  activeId = "off";
}

/** 播放中平滑调节音量；volume 0-1 */
export function setAmbientVolume(volume: number): void {
  activeVolume = Math.min(1, Math.max(0, volume));
  if (masterGain && ctx && activeId !== "off") {
    const spec = AMBIENT_SPECS[activeId];
    masterGain.gain.setTargetAtTime(Math.max(0.0001, spec.gain * activeVolume), ctx.currentTime, 0.12);
  }
}

export function getAmbientId(): AmbientId {
  return activeId;
}

export function isAmbientPlaying(): boolean {
  return activeId !== "off" && masterGain !== null;
}

/**
 * TTS 能力探测：当前桥接浏览器 SpeechSynthesis。
 * 后续接入本地 TTS provider（Piper / Kokoro）时在此扩展，UI 只读此函数。
 */
export function isTtsAvailable(): boolean {
  return isBookTtsSupported();
}

/* ── 睡眠定时：到点停环境音并广播事件（阅读器收到后停 TTS） ── */
export const SLEEP_TIMER_EVENT = "bookroom:sleep-timer-fired";

let sleepTimerId: number | null = null;

export function setSleepTimer(minutes: number, onFire?: () => void): void {
  clearSleepTimer();
  if (minutes <= 0) return;
  sleepTimerId = window.setTimeout(() => {
    sleepTimerId = null;
    stopAmbient();
    window.dispatchEvent(new CustomEvent(SLEEP_TIMER_EVENT));
    onFire?.();
  }, minutes * 60 * 1000);
}

export function clearSleepTimer(): void {
  if (sleepTimerId !== null) {
    window.clearTimeout(sleepTimerId);
    sleepTimerId = null;
  }
}

export function hasSleepTimer(): boolean {
  return sleepTimerId !== null;
}
