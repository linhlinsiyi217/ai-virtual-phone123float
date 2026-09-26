/**
 * 书房「夜读音频层」— 环境音（Web Audio 真实合成）+ TTS 能力状态 + 睡眠定时。
 *
 * - 环境音不依赖任何音频资源文件：噪声 Buffer + 滤波器 + 随机事件层实时合成，
 *   雨声 / 夜雨窗边 / 海浪 / 森林 / 河流 / 壁炉 / 咖啡馆 / 图书馆 / 风扇 / 轻风 / 火车远行，
 *   全部离线可听，无来源不明音频。
 * - TTS 预留 provider 架构：当前桥接浏览器 SpeechSynthesis 可用性，
 *   后续可在此接入 Piper / Kokoro 等本地引擎；不可用时 UI 必须诚实显示。
 * - 环境音音量与 TTS 音量完全分离。
 */

import { isBookTtsSupported } from "./bookroom-tts";

export type AmbientId =
  | "off"
  | "rain"
  | "night-rain"
  | "wave"
  | "forest"
  | "river"
  | "fireplace"
  | "cafe"
  | "library"
  | "fan"
  | "wind"
  | "train";

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

/** 持续噪声层 */
type NoiseLayerSpec = {
  noise: "white" | "brown";
  filterType: BiquadFilterType;
  frequency: number;
  q?: number;
  gain: number;
  /** 超低频 LFO 调制增益，模拟起伏 */
  lfo?: { frequency: number; depth: number };
  /** 恒定低音（风扇电机嗡鸣等） */
  hum?: { frequency: number; gain: number };
};

/** 随机事件层：鸟叫 / 柴火噼啪 / 模糊人声 / 翻页 / 火车节奏 */
type EventKind = "chirp" | "crackle" | "murmur" | "page" | "clack";

type EventSpec = {
  kind: EventKind;
  /** 下次事件间隔区间（秒） */
  minGap: number;
  maxGap: number;
  /** 事件整体响度系数 */
  gain: number;
};

type AmbientSpec = {
  layers: NoiseLayerSpec[];
  events?: EventSpec;
};

const AMBIENT_SPECS: Record<Exclude<AmbientId, "off">, AmbientSpec> = {
  rain: {
    layers: [{ noise: "white", filterType: "bandpass", frequency: 1800, q: 0.55, gain: 0.42 }],
  },
  "night-rain": {
    /* 夜雨窗边：远处低频闷响 + 更柔更暗的雨点 */
    layers: [
      { noise: "brown", filterType: "lowpass", frequency: 180, gain: 0.5 },
      { noise: "white", filterType: "bandpass", frequency: 1200, q: 0.6, gain: 0.26 },
    ],
  },
  wave: {
    layers: [
      { noise: "brown", filterType: "lowpass", frequency: 400, gain: 0.85, lfo: { frequency: 0.08, depth: 0.45 } },
    ],
  },
  forest: {
    layers: [{ noise: "white", filterType: "highpass", frequency: 2500, gain: 0.08 }],
    events: { kind: "chirp", minGap: 1.2, maxGap: 5.5, gain: 0.5 },
  },
  river: {
    layers: [
      { noise: "white", filterType: "bandpass", frequency: 850, q: 0.4, gain: 0.5, lfo: { frequency: 0.12, depth: 0.18 } },
    ],
  },
  fireplace: {
    layers: [{ noise: "brown", filterType: "lowpass", frequency: 300, gain: 0.75 }],
    events: { kind: "crackle", minGap: 0.08, maxGap: 0.9, gain: 0.5 },
  },
  cafe: {
    layers: [{ noise: "brown", filterType: "lowpass", frequency: 620, gain: 0.42 }],
    events: { kind: "murmur", minGap: 2, maxGap: 6, gain: 0.4 },
  },
  library: {
    layers: [{ noise: "brown", filterType: "lowpass", frequency: 240, gain: 0.3 }],
    events: { kind: "page", minGap: 8, maxGap: 20, gain: 0.35 },
  },
  fan: {
    layers: [
      {
        noise: "brown",
        filterType: "lowpass",
        frequency: 500,
        gain: 0.4,
        lfo: { frequency: 0.9, depth: 0.12 },
        hum: { frequency: 108, gain: 0.05 },
      },
    ],
  },
  wind: {
    layers: [
      { noise: "brown", filterType: "bandpass", frequency: 480, q: 1.4, gain: 0.6, lfo: { frequency: 0.07, depth: 0.45 } },
    ],
  },
  train: {
    layers: [{ noise: "brown", filterType: "lowpass", frequency: 220, gain: 0.7 }],
    events: { kind: "clack", minGap: 0.5, maxGap: 0.62, gain: 0.55 },
  },
};

let eventTimer: number | null = null;

/** 触发一次随机环境事件（全程合成，短包络，自动回收节点） */
function fireEvent(audio: AudioContext, dest: AudioNode, spec: EventSpec, volume: number): void {
  const t = audio.currentTime;
  const v = Math.max(0.0001, spec.gain * volume);
  if (spec.kind === "chirp") {
    // 鸟鸣：1~3 个短促上滑音
    const notes = 1 + Math.floor(Math.random() * 3);
    for (let n = 0; n < notes; n += 1) {
      const osc = audio.createOscillator();
      osc.type = "sine";
      const f0 = 1600 + Math.random() * 1200;
      osc.frequency.setValueAtTime(f0, t + n * 0.11);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t + n * 0.11 + 0.06);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, t + n * 0.11);
      g.gain.exponentialRampToValueAtTime(v * 0.16, t + n * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n * 0.11 + 0.09);
      osc.connect(g);
      g.connect(dest);
      osc.start(t + n * 0.11);
      osc.stop(t + n * 0.11 + 0.1);
    }
    return;
  }
  // 其余事件均为短噪声片段
  const duration =
    spec.kind === "crackle" ? 0.02 + Math.random() * 0.06
    : spec.kind === "page" ? 0.12 + Math.random() * 0.25
    : spec.kind === "clack" ? 0.1
    : 0.2 + Math.random() * 0.4; // murmur
  const source = audio.createBufferSource();
  source.buffer = makeNoiseBuffer(audio, "white");
  const filter = audio.createBiquadFilter();
  if (spec.kind === "crackle") {
    filter.type = "highpass";
    filter.frequency.value = 1500 + Math.random() * 1800;
  } else if (spec.kind === "clack") {
    filter.type = "lowpass";
    filter.frequency.value = 320;
  } else {
    filter.type = "bandpass";
    filter.frequency.value = spec.kind === "page" ? 1800 : 520 + Math.random() * 260;
    filter.Q.value = 0.8;
  }
  const g = audio.createGain();
  const peak = spec.kind === "crackle" ? v * 0.5 : v * 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + duration * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  source.connect(filter);
  filter.connect(g);
  g.connect(dest);
  source.start(t);
  source.stop(t + duration + 0.02);
}

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
  const gain = audio.createGain();
  // 淡入，避免爆音
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, activeVolume), audio.currentTime + 0.6);
  gain.connect(audio.destination);
  masterGain = gain;

  const cleanups: (() => void)[] = [];
  for (const layerSpec of spec.layers) {
    const source = audio.createBufferSource();
    source.buffer = makeNoiseBuffer(audio, layerSpec.noise);
    source.loop = true;

    const filter = audio.createBiquadFilter();
    filter.type = layerSpec.filterType;
    filter.frequency.value = layerSpec.frequency;
    if (layerSpec.q) filter.Q.value = layerSpec.q;

    const layerGain = audio.createGain();
    layerGain.gain.value = Math.max(0.0001, layerSpec.gain);

    source.connect(filter);
    filter.connect(layerGain);
    layerGain.connect(gain);
    source.start();
    cleanups.push(() => { try { source.stop(); } catch { /* 已停止 */ } });

    if (layerSpec.lfo) {
      const lfo = audio.createOscillator();
      lfo.frequency.value = layerSpec.lfo.frequency;
      const lfoGain = audio.createGain();
      lfoGain.gain.value = layerSpec.gain * layerSpec.lfo.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(layerGain.gain);
      lfo.start();
      cleanups.push(() => { try { lfo.stop(); } catch { /* 已停止 */ } });
    }
    if (layerSpec.hum) {
      const hum = audio.createOscillator();
      hum.type = "sine";
      hum.frequency.value = layerSpec.hum.frequency;
      const humGain = audio.createGain();
      humGain.gain.value = layerSpec.hum.gain;
      hum.connect(humGain);
      humGain.connect(gain);
      hum.start();
      cleanups.push(() => { try { hum.stop(); } catch { /* 已停止 */ } });
    }
  }

  if (spec.events) {
    const eventSpec = spec.events;
    const scheduleNext = () => {
      const gap = eventSpec.minGap + Math.random() * Math.max(0.01, eventSpec.maxGap - eventSpec.minGap);
      eventTimer = window.setTimeout(() => {
        if (audio && masterGain) fireEvent(audio, gain, eventSpec, activeVolume);
        scheduleNext();
      }, gap * 1000);
    };
    scheduleNext();
  }

  activeId = id;
  stopCurrentSource = () => {
    if (eventTimer !== null) {
      window.clearTimeout(eventTimer);
      eventTimer = null;
    }
    cleanups.forEach(fn => fn());
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
    masterGain.gain.setTargetAtTime(Math.max(0.0001, activeVolume), ctx.currentTime, 0.12);
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
