/**
 * 书房「从此听」— 朗读控制器（Phase 3B）。
 *
 * 复用浏览器原生 SpeechSynthesis（项目云 TTS 服务是按句付费合成，
 * 不适合整章连续朗读；规范允许 SpeechSynthesis 作为 fallback）。
 * 不做语音商店 / 角色音色绑定；仅提供：从某段开始、暂停、继续、停止、语速。
 */

export type BookTtsStatus = "idle" | "playing" | "paused";

export type BookTtsHandlers = {
  onIndex?: (paragraphIndex: number) => void;
  onStatus?: (status: BookTtsStatus) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

export function isBookTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export type BookTtsVoice = {
  /** SpeechSynthesisVoice.voiceURI */
  uri: string;
  name: string;
  lang: string;
  /** 由声线名称启发式判断，仅供 UI 筛选 */
  gender: "female" | "male" | "unknown";
  /** 优先级分数：zh-CN > zh-TW / zh-HK > 其他中文 */
  priority: number;
};

function guessVoiceGender(name: string): BookTtsVoice["gender"] {
  const n = name.toLowerCase();
  const femaleHints = /female|woman|girl|xiaoxiao|xiaoyi|yaoyao|huihui|samantha|victoria|zira|susan|karen|moira|tessa|sinji|mei|ting/;
  const maleHints = /male|man|boy|daniel|alex|fred|david|mark|james|oliver|thomas|george|kangkang|yunjian|dawei/;
  if (femaleHints.test(n)) return "female";
  if (maleHints.test(n)) return "male";
  return "unknown";
}

/**
 * 读取设备可用朗读音色，优先 zh-CN / zh-TW / zh-HK。
 * 部分引擎（Chrome）首次返回空列表，需监听 voiceschanged 后再取。
 */
export function getBookTtsVoices(): BookTtsVoice[] {
  if (!isBookTtsSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .map((v): BookTtsVoice | null => {
      const lang = (v.lang || "").toLowerCase();
      if (lang.startsWith("zh-cn")) {
        return { uri: v.voiceURI, name: v.name, lang: v.lang, gender: guessVoiceGender(v.name), priority: 30 };
      }
      if (lang.startsWith("zh") || lang.startsWith("cmn")) {
        return { uri: v.voiceURI, name: v.name, lang: v.lang, gender: guessVoiceGender(v.name), priority: 20 };
      }
      return null;
    })
    .filter((x): x is BookTtsVoice => x !== null)
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

/** voiceschanged 监听，返回卸载函数 */
export function onBookTtsVoicesChanged(callback: () => void): () => void {
  if (!isBookTtsSupported()) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback);
}

export type BookTtsController = {
  start: (paragraphs: string[], fromIndex?: number, fromChar?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
  /** 朗读音量（0-1），与环境音音量分离；播放中即时生效（重启当前段） */
  setVolume: (volume: number) => void;
  /** Phase 9B-2：朗读音高 0.5~2 */
  setPitch: (pitch: number) => void;
  /** Phase 9B-2：切换音色（voiceURI），播放中重启当前段生效 */
  setVoice: (uri: string) => void;
  getStatus: () => BookTtsStatus;
  getIndex: () => number;
};

export function createBookTts(
  handlers: BookTtsHandlers = {},
  opts: { volume?: number; pitch?: number; voiceURI?: string } = {},
): BookTtsController {
  const synth = window.speechSynthesis;
  let paragraphs: string[] = [];
  let index = -1;
  let status: BookTtsStatus = "idle";
  let rate = 1;
  let pitch = Math.min(2, Math.max(0.5, opts.pitch ?? 1));
  let volume = Math.min(1, Math.max(0, opts.volume ?? 1));
  let voiceURI = opts.voiceURI ?? "";
  let stopped = false;

  const resolveVoice = (): SpeechSynthesisVoice | null => {
    if (!voiceURI) return null;
    return synth.getVoices().find(v => v.voiceURI === voiceURI) ?? null;
  };

  const setStatus = (next: BookTtsStatus) => {
    status = next;
    handlers.onStatus?.(next);
  };

  /** 重新应用参数：音高/音色/音量/语速在播放中改动都重启当前段 */
  const restartCurrent = () => {
    if (status !== "playing" || index < 0) return;
    stopped = false;
    synth.cancel();
    window.setTimeout(() => { if (!stopped) speakIndex(index); }, 60);
  };

  const speakIndex = (i: number) => {
    if (stopped) return;
    if (i >= paragraphs.length) {
      index = -1;
      handlers.onIndex?.(-1);
      setStatus("idle");
      handlers.onEnd?.();
      return;
    }
    index = i;
    handlers.onIndex?.(i);
    const text = paragraphs[i]?.trim();
    if (!text) {
      speakIndex(i + 1);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[一-鿿]/.test(text) ? "zh-CN" : "en-US";
    utterance.rate = rate;
    utterance.volume = volume;
    utterance.pitch = pitch;
    const voice = resolveVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => {
      if (stopped) return;
      // Chrome 在 pause 后恢复也可能触发 onend，用状态守门
      if (status === "playing") speakIndex(i + 1);
    };
    utterance.onerror = event => {
      if (stopped || event.error === "canceled" || event.error === "interrupted") return;
      handlers.onError?.("朗读暂时不可用");
      setStatus("idle");
    };
    synth.speak(utterance);
  };

  return {
    start(nextParagraphs, fromIndex = 0, fromChar = 0) {
      synth.cancel();
      stopped = false;
      paragraphs = nextParagraphs;
      let start = Math.max(0, Math.min(fromIndex, nextParagraphs.length - 1));
      // 选中位置在该段很靠后时，直接从下一段开始更自然
      const firstText = nextParagraphs[start] ?? "";
      if (fromChar > 0 && fromChar > firstText.length * 0.6) start = Math.min(start + 1, nextParagraphs.length - 1);
      setStatus("playing");
      // cancel 后部分引擎需要一拍再入队
      window.setTimeout(() => {
        if (!stopped) speakIndex(start);
      }, 60);
    },
    pause() {
      if (status !== "playing") return;
      synth.pause();
      setStatus("paused");
    },
    resume() {
      if (status !== "paused") return;
      synth.resume();
      setStatus("playing");
    },
    stop() {
      stopped = true;
      synth.cancel();
      index = -1;
      handlers.onIndex?.(-1);
      setStatus("idle");
    },
    setRate(nextRate) {
      rate = Math.min(2, Math.max(0.5, nextRate));
      restartCurrent();
    },
    setVolume(nextVolume) {
      volume = Math.min(1, Math.max(0, nextVolume));
      restartCurrent();
    },
    setPitch(nextPitch) {
      pitch = Math.min(2, Math.max(0.5, nextPitch));
      restartCurrent();
    },
    setVoice(uri) {
      voiceURI = uri || "";
      restartCurrent();
    },
    getStatus: () => status,
    getIndex: () => index,
  };
}
