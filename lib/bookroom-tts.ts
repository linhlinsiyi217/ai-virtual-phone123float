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

export type BookTtsController = {
  start: (paragraphs: string[], fromIndex?: number, fromChar?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
  /** Phase 9A：朗读音量（0-1），与环境音音量分离；播放中即时生效（重启当前段） */
  setVolume: (volume: number) => void;
  getStatus: () => BookTtsStatus;
  getIndex: () => number;
};

export function createBookTts(
  handlers: BookTtsHandlers = {},
  opts: { volume?: number } = {},
): BookTtsController {
  const synth = window.speechSynthesis;
  let paragraphs: string[] = [];
  let index = -1;
  let status: BookTtsStatus = "idle";
  let rate = 1;
  let volume = Math.min(1, Math.max(0, opts.volume ?? 1));
  let stopped = false;

  const setStatus = (next: BookTtsStatus) => {
    status = next;
    handlers.onStatus?.(next);
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
      const willPlay = status === "playing";
      rate = Math.min(2, Math.max(0.5, nextRate));
      if (willPlay && index >= 0) {
        // 从当前段重新开始以应用新语速
        stopped = false;
        synth.cancel();
        setStatus("playing");
        window.setTimeout(() => { if (!stopped) speakIndex(index); }, 60);
      }
    },
    setVolume(nextVolume) {
      const willPlay = status === "playing";
      volume = Math.min(1, Math.max(0, nextVolume));
      if (willPlay && index >= 0) {
        // 与 setRate 同理：重启当前段让新音量生效
        stopped = false;
        synth.cancel();
        setStatus("playing");
        window.setTimeout(() => { if (!stopped) speakIndex(index); }, 60);
      }
    },
    getStatus: () => status,
    getIndex: () => index,
  };
}
