// lib/builtin-plugins/workshop-outline-memory-capsule.ts
// 工坊对话大纲与原生吸附胶囊 · V2.0 by 阿念
//
// 【项目内置插件】随应用发货，由 lib/chat-plugin-builtin.ts 播种进插件表，
// 经现有 chat-plugin-runtime 装载（与用户手动安装的插件走同一条加载路径）。
// 用户在「聊天页 → 更多 → 扩展插件」里可见、可停用、可卸载。
//
// 依赖 window.__WORKSHOP_RUNTIME__（宿主：components/phone-qa-app.tsx）
//   getContainer / getActiveSessionId / getMessages / scrollToBottom / carryOverSession
//
// 能力：
//   1. 上滑浏览历史对话时，输入栏上方出现「当前轮次 / 总轮次」淡紫胶囊；
//   2. 点击胶囊展开对话大纲，可跳转到任意一轮，或一键定位最后一次 AI 回复；
//   3. 大纲内「结转新会话」：把当前记忆浓缩为摘要开新会话，过程中显示流光进度，
//      完成后自动切到新会话（Token 空间已重置）。

import type { ChatPluginContext, ChatPluginModule } from "../chat-plugin-types";

/** 工坊在 components/phone-qa-app.tsx 里挂到 window 上的开放运行时 */
type WorkshopRuntime = {
    version?: string;
    getContainer?: () => HTMLElement | null;
    getActiveSessionId?: () => string | null;
    getMessages?: () => unknown[];
    scrollToBottom?: (smooth?: boolean) => void;
    carryOverSession?: (sessionId?: string) => Promise<string | null>;
};

/** 开发诊断：控制台可见 [WorkshopPlugin] 前缀日志，并同步进扩展插件运行日志 */
const DEBUG = true;

type Round = {
    roundNum: number;
    title: string;
    userWrap: Element | null;
    assistantWrap: Element | null;
};

function readRuntime(): WorkshopRuntime | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as unknown as { __WORKSHOP_RUNTIME__?: WorkshopRuntime }).__WORKSHOP_RUNTIME__;
}

const plugin: ChatPluginModule = {
    manifest: {
        id: "workshop-outline-memory-capsule",
        name: "工坊对话大纲与原生吸附胶囊",
        apiVersion: 1,
        version: "7.4.0",
        author: "阿念",
        description: "工坊专属：微光淡紫胶囊、统一气泡大纲、无损记忆结转（依赖工坊 Runtime v2.0）。",
    },

    setup(ctx: ChatPluginContext) {
        // 插件私有日志：同时进「扩展插件 → 运行日志」与控制台，避免静默失败
        const note = (message: string, level: "info" | "error" = "info") => {
            try { ctx.system.log(`[WorkshopPlugin] ${message}`); } catch { /* 日志失败不影响插件 */ }
            if (DEBUG) {
                if (level === "error") console.warn("[WorkshopPlugin]", message);
                else console.debug("[WorkshopPlugin]", message);
            }
        };
        note("setup start: workshop-outline-memory-capsule v7.4.0");

        // ── 1. 注入样式 ──
        ctx.ui.injectCSS(`
      .qa-scroll-bottom-btn {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .qa-composer-wrap {
        position: absolute !important;
      }
      .qa-drawer-item.is-carrying .qa-drawer-item-menu {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .xf-qa-capsule {
        position: absolute;
        right: 12px;
        top: -38px;
        display: none;
        align-items: center;
        height: 28px;
        padding: 0 4px 0 5px;
        border-radius: 999px;
        z-index: 20;
        pointer-events: auto;
        user-select: none;
        -webkit-user-select: none;
        opacity: 0;
        transform: translateY(4px) scale(0.95);
        transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1), transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(20px) saturate(1.7);
        -webkit-backdrop-filter: blur(20px) saturate(1.7);
        border: 1px solid rgba(255, 255, 255, 0.95);
        box-shadow:
          0 4px 14px rgba(40, 34, 20, 0.08),
          0 0 10px rgba(115, 89, 230, 0.14),
          inset 0 1px 1px #ffffff;
      }
      .xf-qa-capsule.is-visible {
        display: inline-flex;
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .xf-qa-capsule:hover {
        background: rgba(255, 255, 255, 0.96);
        box-shadow:
          0 6px 18px rgba(40, 34, 20, 0.12),
          0 0 14px rgba(115, 89, 230, 0.22),
          inset 0 1px 1px #ffffff;
        transform: translateY(-1px) scale(1.02);
      }
      .xf-qa-capsule:active { transform: scale(0.96); }
      .xf-qa-round-btn {
        display: flex; align-items: center; gap: 5px;
        height: 100%; padding: 0 4px 0 1px;
        border: none; border-radius: 999px; background: transparent;
        color: #2b2a26; font-size: 11.5px; font-weight: 600; cursor: pointer;
      }
      .xf-qa-round-icon-badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 17px; height: 17px; border-radius: 50%;
        background: rgba(115, 89, 230, 0.12); color: #7359e6;
      }
      .xf-qa-capsule-divider {
        width: 1px; height: 12px; background: rgba(40, 34, 20, 0.12); margin: 0 2px;
      }
      .xf-qa-direct-btn {
        display: flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border: none; border-radius: 50%;
        background: rgba(115, 89, 230, 0.08); color: #7359e6;
        cursor: pointer; transition: all 0.15s ease;
      }
      .xf-qa-direct-btn:hover { background: rgba(115, 89, 230, 0.18); transform: translateY(1px); }
      .xf-qa-direct-btn:active { transform: scale(0.88); }
      .xf-qa-outline-modal {
        position: absolute; right: 12px; bottom: calc(100% - 30px);
        width: min(86vw, 300px); max-height: 48vh;
        border-radius: 18px; z-index: 30;
        pointer-events: auto; display: none; flex-direction: column;
        overflow: hidden; opacity: 0;
        transform: translateY(8px) scale(0.96);
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(24px) saturate(1.8);
        -webkit-backdrop-filter: blur(24px) saturate(1.8);
        border: 1px solid rgba(255, 255, 255, 0.95);
        box-shadow: 0 12px 36px rgba(40, 34, 20, 0.18), inset 0 1.5px 1px #fff;
      }
      .xf-qa-outline-modal.is-open {
        display: flex; opacity: 1; transform: translateY(0) scale(1);
      }
      .xf-qa-outline-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 11px 14px 8px;
        border-bottom: 1px solid rgba(40, 34, 20, 0.07);
        font-size: 13px; font-weight: 700; color: #2b2a26;
      }
      .xf-qa-outline-carryover-btn {
        position: relative; display: inline-flex; align-items: center; justify-content: center;
        gap: 4px; padding: 4px 9px; border-radius: 7px;
        border: 1px solid rgba(115, 89, 230, 0.28);
        background: rgba(115, 89, 230, 0.08);
        color: #7359e6; font-size: 11.5px; font-weight: 600;
        cursor: pointer; overflow: hidden; transition: all 0.18s ease;
      }
      .xf-qa-outline-carryover-btn:hover {
        background: rgba(115, 89, 230, 0.16);
        border-color: rgba(115, 89, 230, 0.45);
      }
      .xf-qa-outline-carryover-btn.is-loading {
        pointer-events: none; background: rgba(115, 89, 230, 0.14);
        border-color: #7359e6; color: #583ec7;
      }
      .xf-qa-carry-progress {
        position: absolute; inset: 0;
        background: linear-gradient(90deg, rgba(115, 89, 230, 0.12), rgba(115, 89, 230, 0.42), rgba(115, 89, 230, 0.12));
        background-size: 200% 100%;
        animation: xf-carry-shimmer 1.2s infinite linear;
      }
      @keyframes xf-carry-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .xf-qa-outline-list {
        flex: 1; overflow-y: auto; padding: 6px 8px;
        display: flex; flex-direction: column; gap: 4px;
        overscroll-behavior: contain;
      }
      .xf-qa-outline-item {
        display: flex; align-items: flex-start; gap: 8px;
        width: 100%; padding: 7px 9px;
        border: none; border-radius: 10px; background: transparent;
        text-align: left; cursor: pointer; transition: background 0.15s ease;
      }
      .xf-qa-outline-item:hover { background: rgba(0, 0, 0, 0.04); }
      .xf-qa-outline-item.is-active { background: rgba(115, 89, 230, 0.1); }
      .xf-qa-outline-num {
        flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
        min-width: 19px; height: 19px; padding: 0 4px; border-radius: 5px;
        background: rgba(0, 0, 0, 0.06);
        font-size: 11px; font-weight: 700; color: #6a685f;
      }
      .xf-qa-outline-item.is-active .xf-qa-outline-num {
        background: #7359e6; color: #fff;
      }
      .xf-qa-outline-text {
        flex: 1; font-size: 12px; line-height: 1.4; color: #2b2a26;
        word-break: break-word;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      @keyframes xf-target-pulse {
        0%   { outline: 2.5px solid rgba(115, 89, 230, 0.85); background: rgba(115, 89, 230, 0.12); border-radius: 12px; }
        50%  { outline: 2.5px solid rgba(115, 89, 230, 0.35); background: rgba(115, 89, 230, 0.05); }
        100% { outline: 2.5px solid transparent; background: transparent; }
      }
      .xf-highlight-anchor {
        animation: xf-target-pulse 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      }
    `);

        // ── 2. DOM 节点 ──
        if (typeof document === "undefined") {
            note("setup aborted: 非浏览器环境", "error");
            return;
        }

        const capsule = document.createElement("div");
        capsule.className = "xf-qa-capsule";
        capsule.innerHTML = `
      <button type="button" class="xf-qa-round-btn" title="查看对话大纲">
        <span class="xf-qa-round-icon-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
            <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </span>
        <span class="xf-qa-round-label">1/1 轮</span>
      </button>
      <div class="xf-qa-capsule-divider"></div>
      <button type="button" class="xf-qa-direct-btn" title="定位最后一次回复">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    `;

        const outlineModal = document.createElement("div");
        outlineModal.className = "xf-qa-outline-modal";
        outlineModal.innerHTML = `
      <div class="xf-qa-outline-header">
        <span>工坊对话大纲</span>
        <button type="button" class="xf-qa-outline-carryover-btn" title="将当前记忆结转至新窗口，重置 Token 空间">
          <span class="xf-qa-btn-text">⚡ 结转新会话</span>
        </button>
      </div>
      <div class="xf-qa-outline-list hide-scrollbar"></div>
    `;

        const roundBtn = capsule.querySelector(".xf-qa-round-btn") as HTMLButtonElement;
        const roundLabel = capsule.querySelector(".xf-qa-round-label") as HTMLElement;
        const directBtn = capsule.querySelector(".xf-qa-direct-btn") as HTMLButtonElement;
        const carryOverBtn = outlineModal.querySelector(".xf-qa-outline-carryover-btn") as HTMLButtonElement;
        const outlineList = outlineModal.querySelector(".xf-qa-outline-list") as HTMLElement;

        // ── 3. 挂载与查询 ──
        let mountedOnce = false;
        function ensureMounted(): Element | null {
            const composerWrap = document.querySelector(".qa-composer-wrap");
            if (!composerWrap) return null;
            if (capsule.parentNode !== composerWrap) {
                composerWrap.appendChild(capsule);
                composerWrap.appendChild(outlineModal);
                if (!mountedOnce) {
                    mountedOnce = true;
                    note("mounted into .qa-composer-wrap");
                }
            }
            return composerWrap;
        }

        function getWorkshopBody(): HTMLElement | null {
            // 优先用 Runtime 给的容器；工坊未打开时回退 DOM 查询
            const fromRuntime = readRuntime()?.getContainer?.();
            if (fromRuntime && fromRuntime.offsetParent !== null) return fromRuntime;
            const qaBody = document.querySelector(".qa-body") as HTMLElement | null;
            if (qaBody && qaBody.offsetParent !== null) return qaBody;
            return null;
        }

        function getHeaderOffset(): number {
            const header = document.querySelector(".qa-header") as HTMLElement | null;
            if (header && header.offsetParent !== null) {
                return header.getBoundingClientRect().height + 14;
            }
            return 88;
        }

        function scrollToElementSafely(container: HTMLElement | null, targetEl: Element | null): void {
            if (!container || !targetEl) return;
            const topOffset = getHeaderOffset();
            const cRect = container.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            const relativeTop = tRect.top - cRect.top;
            const finalScrollTop = Math.max(0, container.scrollTop + relativeTop - topOffset);
            container.scrollTo({ top: finalScrollTop, behavior: "smooth" });
        }

        function getRounds(container: HTMLElement | null): Round[] {
            if (!container) return [];
            const wraps = Array.from(container.querySelectorAll(".qa-msg-wrap"));
            const rounds: Round[] = [];
            let currentRound: Round | null = null;

            wraps.forEach((wrap) => {
                const userEl = wrap.querySelector(".qa-msg-user");
                const assistantEl = wrap.querySelector(".qa-msg-assistant");
                if (userEl) {
                    if (currentRound) rounds.push(currentRound);
                    const raw = (userEl.textContent || "").replace(/\s+/g, " ").trim();
                    currentRound = {
                        roundNum: rounds.length + 1,
                        title: raw || `第 ${rounds.length + 1} 轮提问`,
                        userWrap: wrap,
                        assistantWrap: null,
                    };
                } else if (assistantEl) {
                    if (!currentRound) {
                        currentRound = {
                            roundNum: rounds.length + 1,
                            title: `第 ${rounds.length + 1} 轮对话`,
                            userWrap: null,
                            assistantWrap: wrap,
                        };
                    } else {
                        currentRound.assistantWrap = wrap;
                    }
                }
            });

            if (currentRound) rounds.push(currentRound);
            return rounds;
        }

        function updateCapsule(): void {
            const composerWrap = ensureMounted();
            const body = getWorkshopBody();
            if (!composerWrap || !body) {
                capsule.classList.remove("is-visible");
                outlineModal.classList.remove("is-open");
                return;
            }
            const rounds = getRounds(body);
            if (rounds.length === 0) {
                capsule.classList.remove("is-visible");
                return;
            }
            const topOffset = getHeaderOffset();
            const cRect = body.getBoundingClientRect();
            const effectiveTop = cRect.top + topOffset;
            const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= 80;

            let activeRoundNum = rounds.length;
            if (!atBottom) {
                for (let i = 0; i < rounds.length; i++) {
                    const r = rounds[i];
                    const target = r.userWrap || r.assistantWrap;
                    if (target) {
                        const b = target.getBoundingClientRect();
                        if (b.bottom >= effectiveTop + 10) {
                            activeRoundNum = r.roundNum;
                            break;
                        }
                    }
                }
            }

            roundLabel.textContent = `${activeRoundNum}/${rounds.length} 轮`;

            // 向上翻阅历史时显示，贴底阅读时自然隐去（插件设计如此，非常驻）
            if (!atBottom) capsule.classList.add("is-visible");
            else capsule.classList.remove("is-visible");
        }

        // ── 4. 交互 ──
        roundBtn.onclick = (e) => {
            e.stopPropagation();
            const body = getWorkshopBody();
            if (!body) {
                note("打开大纲失败：未找到工坊消息容器（.qa-body / Runtime.getContainer）", "error");
                return;
            }
            if (outlineModal.classList.contains("is-open")) {
                outlineModal.classList.remove("is-open");
                return;
            }
            const rounds = getRounds(body);
            if (rounds.length === 0) {
                note("打开大纲失败：当前会话没有可识别的轮次（.qa-msg-wrap 为空）", "error");
                return;
            }

            const topOffset = getHeaderOffset();
            const cRect = body.getBoundingClientRect();
            const effectiveTop = cRect.top + topOffset;
            outlineList.innerHTML = "";

            rounds.forEach((r) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "xf-qa-outline-item";

                const target = r.userWrap || r.assistantWrap;
                if (target) {
                    const b = target.getBoundingClientRect();
                    if (b.top <= effectiveTop + 80 && b.bottom >= effectiveTop) {
                        item.classList.add("is-active");
                    }
                }

                const numSpan = document.createElement("span");
                numSpan.className = "xf-qa-outline-num";
                numSpan.textContent = String(r.roundNum);
                const textSpan = document.createElement("span");
                textSpan.className = "xf-qa-outline-text";
                textSpan.textContent = r.title;
                item.appendChild(numSpan);
                item.appendChild(textSpan);

                item.onclick = (ev) => {
                    ev.stopPropagation();
                    outlineModal.classList.remove("is-open");
                    if (target) {
                        scrollToElementSafely(body, target);
                        target.classList.remove("xf-highlight-anchor");
                        void (target as HTMLElement).offsetWidth;
                        target.classList.add("xf-highlight-anchor");
                        setTimeout(() => target.classList.remove("xf-highlight-anchor"), 1500);
                    }
                };

                outlineList.appendChild(item);
            });

            outlineModal.classList.add("is-open");
        };

        directBtn.onclick = (e) => {
            e.stopPropagation();
            const body = getWorkshopBody();
            if (!body) return;
            outlineModal.classList.remove("is-open");

            const assistantNodes = body.querySelectorAll(".qa-msg-assistant");
            const lastAssistant = assistantNodes.length > 0 ? assistantNodes[assistantNodes.length - 1] : null;

            if (lastAssistant) {
                const targetWrap = lastAssistant.closest(".qa-msg-wrap") || lastAssistant;
                scrollToElementSafely(body, targetWrap);
                targetWrap.classList.remove("xf-highlight-anchor");
                void (targetWrap as HTMLElement).offsetWidth;
                targetWrap.classList.add("xf-highlight-anchor");
                setTimeout(() => targetWrap.classList.remove("xf-highlight-anchor"), 1500);
            } else {
                const runtime = readRuntime();
                if (runtime?.scrollToBottom) runtime.scrollToBottom(true);
                else body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
            }
        };

        carryOverBtn.onclick = async (e) => {
            e.stopPropagation();
            if (carryOverBtn.classList.contains("is-loading")) return;

            const runtime = readRuntime();
            if (!runtime?.carryOverSession) {
                note("结转失败：未检测到 window.__WORKSHOP_RUNTIME__.carryOverSession", "error");
                ctx.ui.toast("未检测到工坊结转支持（请更新工坊到 v2.0+）");
                return;
            }

            carryOverBtn.classList.add("is-loading");
            carryOverBtn.innerHTML = `
        <div class="xf-qa-carry-progress"></div>
        <span style="position:relative;z-index:1;">⚡ 正在结转中...</span>
      `;

            try {
                const newId = await runtime.carryOverSession();
                if (newId) {
                    note(`结转完成，新会话 ${newId}`);
                    ctx.ui.toast("⚡ 已提炼记忆并转结到新会话，Token 空间已重置");
                    outlineModal.classList.remove("is-open");
                } else {
                    note("结转未完成：Runtime 返回 null（会话为空 / 正在生成 / 压缩中）", "error");
                    ctx.ui.toast("结转失败或当前会话为空");
                }
            } catch (err) {
                note(`结转异常：${err instanceof Error ? err.message : String(err)}`, "error");
                ctx.ui.toast("结转过程发生异常");
            } finally {
                carryOverBtn.classList.remove("is-loading");
                carryOverBtn.innerHTML = `<span class="xf-qa-btn-text">⚡ 结转新会话</span>`;
            }
        };

        // ── 5. 全局事件监听 ──
        // 注意声明顺序：runtimeLogged 必须先于 onWorkshopEvent 初始化，
        // 否则回调触发时会命中 const/let 的暂时性死区（TDZ）。
        let runtimeLogged = false;

        const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as Element | null;
            if (target && !outlineModal.contains(target) && !capsule.contains(target)) {
                outlineModal.classList.remove("is-open");
            }
            const menuBtn = target?.closest?.(".qa-drawer-menu-btn") ?? null;
            if (menuBtn) {
                const menu = menuBtn.closest(".qa-drawer-item-menu");
                if (menu) {
                    (menu as HTMLElement).style.display = "none";
                    setTimeout(() => { if (menu) (menu as HTMLElement).style.removeProperty("display"); }, 300);
                }
            }
        };
        window.addEventListener("click", handleGlobalClick, true);

        const onScroll = (e: Event) => {
            const target = e.target as Element | null;
            if (target?.classList?.contains("qa-body")) updateCapsule();
        };
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });

        const onWorkshopEvent = () => {
            const runtime = readRuntime();
            if (runtime && !runtimeLogged) {
                runtimeLogged = true;
                note(`runtime detected (v${runtime.version || "?"}), carryOverSession=${typeof runtime.carryOverSession}`);
            }
            updateCapsule();
        };
        window.addEventListener("workshop:open", onWorkshopEvent);
        window.addEventListener("workshop:update", onWorkshopEvent);
        const onWorkshopClose = () => {
            capsule.classList.remove("is-visible");
            outlineModal.classList.remove("is-open");
        };
        window.addEventListener("workshop:close", onWorkshopClose);

        // 插件启用时工坊可能已经打开：主动触发一次
        if (readRuntime()) {
            note("runtime detected at setup（工坊已打开）");
            updateCapsule();
        } else {
            note("工坊尚未打开：等待 workshop:open 事件");
        }
        note("setup success");

        // ── 6. 卸载清理 ──
        return () => {
            window.removeEventListener("click", handleGlobalClick, true);
            window.removeEventListener("scroll", onScroll, { capture: true });
            window.removeEventListener("workshop:open", onWorkshopEvent);
            window.removeEventListener("workshop:update", onWorkshopEvent);
            window.removeEventListener("workshop:close", onWorkshopClose);
            if (capsule.parentNode) capsule.parentNode.removeChild(capsule);
            if (outlineModal.parentNode) outlineModal.parentNode.removeChild(outlineModal);
        };
    },
};

export default plugin;