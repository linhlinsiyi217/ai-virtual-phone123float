import { callQaAgent, compactQaContext, formatQaErrorMessage, type QaContextEntry } from "./qa-agent-engine";
import { QA_TOOLS, formatQaToolSubtitle, type QaCreatedContent, type QaProposedCommit } from "./qa-agent-tools";
import { loadQaGithubConfig } from "./qa-github";
import { commitQaFiles, revertQaCommit, verifyQaCommitApplied, type QaCommitResult } from "./qa-github-write";

// ── 答疑 App 会话存储 ─────────────────────────────────
// 模式与 mascot-chat-store 一致：裸 IndexedDB + 模块级单例 + subscribe/snapshot。
// 独立 DB，多会话。

const QA_DB_NAME = "AiPhoneQaDB";
// A restore into a fresh browser creates the missing store in DB version 2.
// Keep the owner at least that high so reopening the restored DB cannot fail
// with VersionError (opening a lower version than the one on disk).
const QA_DB_VERSION = 2;
const QA_STORE = "qa";
const QA_STATE_KEY = "state";
const MAX_SESSIONS = 30;
const MAX_MESSAGES_PER_SESSION = 200;

export type QaToolStatus = { name: string; running: boolean; success?: boolean; detail?: string; result?: string; subtitle?: string };

export type QaTextAttachment = { name: string; content: string };

export const QA_TEXT_ATTACHMENT_MAX_BYTES = 1024 * 1024;
export const QA_TEXT_ATTACHMENTS_MAX_COUNT = 6;
export const QA_TEXT_ATTACHMENTS_MAX_CHARS = 200_000;

export function validateQaTextAttachments(files?: QaTextAttachment[]): string | null {
    if (!files?.length) return null;
    if (files.length > QA_TEXT_ATTACHMENTS_MAX_COUNT) return `最多添加 ${QA_TEXT_ATTACHMENTS_MAX_COUNT} 个附件。`;
    if (new Set(files.map((file) => file.name)).size !== files.length) return "不能添加同名附件。";
    const chars = files.reduce((sum, file) => sum + file.name.length + file.content.length, 0);
    if (chars > QA_TEXT_ATTACHMENTS_MAX_CHARS) {
        return `附件文本合计不能超过 ${Math.floor(QA_TEXT_ATTACHMENTS_MAX_CHARS / 1000)}K 字符。`;
    }
    return null;
}

/** 消息内的时序分段：文字与工具行按实际发生顺序交错展示 */
export type QaSegment =
    | { kind: "text"; text: string }
    | { kind: "tool"; tool: QaToolStatus };

export type QaPendingCommit = {
    proposal: QaProposedCommit;
    /**
     * pending    提案已生成，等待用户确认（可应用）
     * applying   正在提交
     * applied    已成功提交（唯一可信的「已落地」态，必须持久化）
     * unverified 提交结果无法确认（网络/422 后核对失败）：不给「应用」入口，防止重复提交
     * reverting  正在撤销 / reverted 已撤销 / canceled 已取消
     */
    status: "pending" | "applying" | "applied" | "unverified" | "reverting" | "reverted" | "canceled";
    result?: QaCommitResult;
    error?: string;
    /** 最后一次尝试提交的时间戳：用于识别「已尝试但状态仍是 pending」的脏状态并自愈核对 */
    lastAttemptAt?: number;
    /** 最后一次核对仓库现状的时间戳与结论说明 */
    verifiedAt?: number;
    verifyNote?: string;
};

export type QaMsg = {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** user：随消息发送的图片（dataURL），点击可查看 */
    images?: string[];
    /** user：随消息发送的纯文本或代码附件 */
    files?: QaTextAttachment[];
    reasoning?: string;
    error?: string;
    aborted?: boolean;
    tools?: QaToolStatus[];
    /** 时序分段（文字/工具交错）；无此字段的旧消息回退「工具在顶、文字在下」布局 */
    segments?: QaSegment[];
    pendingCommit?: QaPendingCommit;
    /** 流过滤器正在缓冲长工具指令：显示"编写工具调用中"占位（瞬态，不持久） */
    toolDrafting?: boolean;
    /** 流式中断降级为非流式时的说明（解释"停几分钟后一口气全出"） */
    streamNote?: string;
    ts: number;
};

export type QaSession = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: QaMsg[];
    /** 抽屉里置顶显示；只影响排序，不动 updatedAt */
    isPinned?: boolean;
    /** 模型侧完整上下文（含工具调用与结果），跨轮保留；触顶时压缩为摘要 */
    context?: QaContextEntry[];
    /** 本会话中 agent 创建/更新过的本机内容（APP/游戏/剧场），供工坊内预览直接打开 */
    createdContent?: QaCreatedContent[];
};

export type QaChatSnapshot = {
    sessions: QaSession[];
    activeSessionId: string | null;
    hydrated: boolean;
    isGenerating: boolean;
    /** 当前会话上下文用量（0-1+，达到 1 触发压缩） */
    contextUsage: number;
    isCompacting: boolean;
};

// ── 上下文预算与压缩 ──
// 预算按字符估算（中文 ≈1 字符/角标 token 量级）。可用 localStorage
// 键 ai_phone_qa_context_budget_chars 覆盖（调参/测试用）。
const DEFAULT_CONTEXT_BUDGET_CHARS = 1_000_000;

function getContextBudget(): number {
    try {
        const raw = Number(localStorage.getItem("ai_phone_qa_context_budget_chars"));
        if (Number.isFinite(raw) && raw >= 2_000 && raw <= 2_000_000) return Math.floor(raw);
    } catch {
        // ignore
    }
    return DEFAULT_CONTEXT_BUDGET_CHARS;
}

function entryChars(entry: QaContextEntry): number {
    let total = entry.content.length;
    for (const file of entry.files ?? []) total += file.name.length + file.content.length;
    for (const call of entry.toolCalls ?? []) {
        total += call.name.length + JSON.stringify(call.args ?? {}).length;
    }
    return total;
}

/** 旧会话没有 context 字段：用可见消息引导出初始上下文 */
function sessionContext(session: QaSession): QaContextEntry[] {
    if (session.context?.length) return session.context;
    const entries: QaContextEntry[] = [];
    for (let index = 0; index < session.messages.length; index += 1) {
        const message = session.messages[index];
        if (message.error || (!message.content.trim() && !message.images?.length && !message.files?.length)) continue;
        if (message.role === "user") {
            const turn = session.messages.slice(index + 1).find((candidate) => candidate.role === "assistant")?.id;
            entries.push({
                role: "user",
                content: message.content,
                images: message.images,
                files: message.files,
                turn,
            });
        } else {
            entries.push({ role: "assistant", content: message.content, turn: message.id });
        }
    }
    return entries;
}

function contextUsageOf(session: QaSession | null): number {
    if (!session) return 0;
    const total = sessionContext(session).reduce((sum, entry) => sum + entryChars(entry), 0);
    return total / getContextBudget();
}

let isCompacting = false;

export const QA_DEFAULT_CONTEXT_BUDGET_CHARS = DEFAULT_CONTEXT_BUDGET_CHARS;
export const QA_CONTEXT_BUDGET_MIN = 2_000;
export const QA_CONTEXT_BUDGET_MAX = 2_000_000;

export function getQaContextBudgetChars(): number {
    return getContextBudget();
}

/** 设置上下文预算（null = 恢复默认）；立即刷新进度条 */
export function setQaContextBudgetChars(chars: number | null): void {
    try {
        if (chars == null) localStorage.removeItem("ai_phone_qa_context_budget_chars");
        else {
            const clamped = Math.min(QA_CONTEXT_BUDGET_MAX, Math.max(QA_CONTEXT_BUDGET_MIN, Math.floor(chars)));
            localStorage.setItem("ai_phone_qa_context_budget_chars", String(clamped));
        }
    } catch {
        // ignore
    }
    emit();
}

/** 当前会话已用的上下文字符数 */
export function getQaActiveContextChars(): number {
    const session = getActiveSession();
    return session ? sessionContext(session).reduce((sum, entry) => sum + entryChars(entry), 0) : 0;
}

/** 是否存在可清理的工具调用历史（tool 条目或带原生 toolCalls 的条目） */
export function hasQaToolHistory(): boolean {
    const session = getActiveSession();
    if (!session) return false;
    return sessionContext(session).some((entry) => entry.role === "tool" || (entry.toolCalls?.length ?? 0) > 0);
}

/** 清理原生工具历史（防报错）：移除 tool 条目、剥离原生调用元数据；普通对话内容保留 */
export function clearQaToolHistory(): { removed: number; cleaned: number } | null {
    const session = getActiveSession();
    if (!session || isGenerating) return null;
    let removed = 0;
    let cleaned = 0;
    const next: QaContextEntry[] = [];
    for (const entry of sessionContext(session)) {
        if (entry.role === "tool") {
            removed += 1;
            continue;
        }
        if (entry.toolCalls?.length) {
            cleaned += 1;
            const { toolCalls: _toolCalls, ...rest } = entry;
            next.push(rest);
        } else {
            next.push(entry);
        }
    }
    updateSession(session.id, (s) => ({ ...s, context: next }));
    return { removed, cleaned };
}

/** 压缩：整段上下文 → 备忘录摘要，失败时保留原上下文下轮再试 */
async function compactSessionContext(sessionId: string): Promise<void> {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || isCompacting) return;
    const entries = sessionContext(session);
    if (entries.length === 0) return;
    isCompacting = true;
    emit();
    try {
        const summary = await compactQaContext(entries);
        if (!summary) throw new Error("空摘要");
        updateSession(sessionId, (s) => ({
            ...s,
            context: [{
                role: "user",
                content: `[之前对话的压缩摘要，供你延续上下文；具体内容可用工具重新读取]\n${summary}`,
            }],
        }));
    } catch {
        // 压缩失败不阻塞对话：保留原上下文，下次触顶再试
    } finally {
        isCompacting = false;
        emit();
    }
}

type PersistedState = { sessions: QaSession[]; activeSessionId: string | null };

const listeners = new Set<() => void>();
let sessions: QaSession[] = [];
let activeSessionId: string | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let isGenerating = false;
let abortController: AbortController | null = null;
let snapshot: QaChatSnapshot = { sessions, activeSessionId, hydrated, isGenerating, contextUsage: 0, isCompacting: false };

function makeId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function openQaDb(): IDBOpenDBRequest {
    const request = indexedDB.open(QA_DB_NAME, QA_DB_VERSION);
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(QA_STORE)) {
            request.result.createObjectStore(QA_STORE);
        }
    };
    return request;
}

function emit() {
    snapshot = {
        sessions,
        activeSessionId,
        hydrated,
        isGenerating,
        contextUsage: contextUsageOf(sessions.find((s) => s.id === activeSessionId) ?? null),
        isCompacting,
    };
    for (const listener of listeners) listener();
}

function persistState() {
    if (typeof indexedDB === "undefined") return;
    try {
        const request = openQaDb();
        request.onsuccess = () => {
            try {
                const db = request.result;
                const tx = db.transaction(QA_STORE, "readwrite");
                const state: PersistedState = { sessions, activeSessionId };
                tx.objectStore(QA_STORE).put(state, QA_STATE_KEY);
                tx.oncomplete = () => db.close();
                tx.onerror = () => db.close();
            } catch {
                // 忽略持久化失败，内存态仍可用。
            }
        };
    } catch {
        // ignore
    }
}

function publish(options?: { persist?: boolean }) {
    if (options?.persist !== false) persistState();
    emit();
}

export function subscribeQaChat(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getQaChatSnapshot(): QaChatSnapshot {
    return snapshot;
}

/** 重命名对话：只改标题，不碰 updatedAt——改个名字不该把会话顶到时间序最前 */
export function renameQaSession(id: string, title: string): void {
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return;
    updateSession(id, (s) => ({ ...s, title: trimmed }));
}

/** 置顶开关：排序在抽屉渲染层做（置顶在前，其余按时间），存储顺序保持时间序 */
export function toggleQaSessionPin(id: string): void {
    updateSession(id, (s) => ({ ...s, isPinned: !s.isPinned }));
}

export async function hydrateQaChat(): Promise<void> {
    if (hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = new Promise<void>((resolve) => {
        if (typeof indexedDB === "undefined") {
            hydrated = true;
            emit();
            resolve();
            return;
        }
        try {
            const request = openQaDb();
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const tx = db.transaction(QA_STORE, "readonly");
                    const get = tx.objectStore(QA_STORE).get(QA_STATE_KEY);
                    get.onsuccess = () => {
                        const state = get.result as PersistedState | undefined;
                        if (state && Array.isArray(state.sessions)) {
                            sessions = state.sessions.slice(0, MAX_SESSIONS);
                            activeSessionId =
                                state.activeSessionId && sessions.some((s) => s.id === state.activeSessionId)
                                    ? state.activeSessionId
                                    : (sessions[0]?.id ?? null);
                        }
                        hydrated = true;
                        emit();
                        db.close();
                        resolve();
                    };
                    get.onerror = () => {
                        hydrated = true;
                        emit();
                        db.close();
                        resolve();
                    };
                } catch {
                    hydrated = true;
                    emit();
                    resolve();
                }
            };
            request.onerror = () => {
                hydrated = true;
                emit();
                resolve();
            };
        } catch {
            hydrated = true;
            emit();
            resolve();
        }
    });
    return hydratePromise;
}

function getActiveSession(): QaSession | null {
    return sessions.find((s) => s.id === activeSessionId) ?? null;
}

export function createQaSession(): string {
    const session: QaSession = {
        id: makeId(),
        title: "新对话",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
    };
    sessions = [session, ...sessions].slice(0, MAX_SESSIONS);
    activeSessionId = session.id;
    publish();
    return session.id;
}

export function switchQaSession(sessionId: string) {
    if (!sessions.some((s) => s.id === sessionId)) return;
    activeSessionId = sessionId;
    publish();
}

export function deleteQaSession(sessionId: string) {
    sessions = sessions.filter((s) => s.id !== sessionId);
    if (activeSessionId === sessionId) {
        activeSessionId = sessions[0]?.id ?? null;
    }
    publish();
}

export type QaMessageEditResult = { ok: true } | { ok: false; reason: string };

function userMessageTurnId(session: QaSession, messageIndex: number): string | undefined {
    return session.messages.slice(messageIndex + 1).find((message) => message.role === "assistant")?.id;
}

function resendTurnIds(session: QaSession, messageIndex: number): Set<string> {
    return new Set(
        session.messages
            .slice(messageIndex + 1)
            .filter((message) => message.role === "assistant")
            .map((message) => message.id),
    );
}

/** 返回无法安全重新生成的原因；null 表示这是一段无工具副作用的用户对话。 */
export function getQaEditAndResendBlockReason(sessionId: string, msgId: string): string | null {
    if (isGenerating || isCompacting) return "小坊正在执行或整理上下文，请等待当前任务完成。";
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session) return "会话已不存在。";
    const messageIndex = session.messages.findIndex((message) => message.id === msgId);
    if (messageIndex < 0) return "消息已不存在。";
    const message = session.messages[messageIndex];
    if (message.role !== "user") return "只有用户消息可以修改后重新发送。";
    if (!userMessageTurnId(session, messageIndex)) return "这条消息缺少完整的回复轮次，无法安全重新发送。";

    const turnIds = resendTurnIds(session, messageIndex);
    const visibleSideEffects = session.messages.slice(messageIndex + 1).some((candidate) =>
        candidate.role === "assistant" && (Boolean(candidate.tools?.length) || Boolean(candidate.pendingCommit)),
    );
    const contextSideEffects = sessionContext(session).some((entry) =>
        Boolean(entry.turn && turnIds.has(entry.turn) && (entry.role === "tool" || entry.toolCalls?.length)),
    );
    if (visibleSideEffects || contextSideEffects) {
        return "后续回复已经调用工具或产生实际操作，不能安全回滚；你仍可以保存文字修改。";
    }
    return null;
}

/** 修改已发送消息，并同步模型侧上下文。 */
export function updateQaMessageContent(
    sessionId: string,
    msgId: string,
    content: string,
    images?: string[],
    files?: QaTextAttachment[],
): QaMessageEditResult {
    if (isGenerating || isCompacting) return { ok: false, reason: "小坊正在执行或整理上下文，请稍后再修改。" };
    if (!content.trim() && !images?.length && !files?.length) return { ok: false, reason: "消息内容不能为空。" };
    const filesError = validateQaTextAttachments(files);
    if (filesError) return { ok: false, reason: filesError };

    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session) return { ok: false, reason: "会话已不存在。" };
    const messageIndex = session.messages.findIndex((message) => message.id === msgId);
    if (messageIndex < 0) return { ok: false, reason: "消息已不存在。" };
    const message = session.messages[messageIndex];
    let nextContext = session.context;

    if (nextContext?.length) {
        if (message.role === "user") {
            const turn = userMessageTurnId(session, messageIndex);
            if (!turn || !nextContext.some((entry) => entry.role === "user" && entry.turn === turn)) {
                return { ok: false, reason: "这条旧消息缺少上下文索引，无法安全修改。" };
            }
            nextContext = nextContext.map((entry) =>
                entry.role === "user" && entry.turn === turn
                    ? { ...entry, content, images: images?.length ? images : undefined, files: files?.length ? files : undefined }
                    : entry,
            );
        } else {
            const assistantIndexes = nextContext
                .map((entry, index) => (entry.role === "assistant" && entry.turn === message.id ? index : -1))
                .filter((index) => index >= 0);
            const lastAssistantIndex = assistantIndexes.at(-1);
            if (lastAssistantIndex == null) return { ok: false, reason: "这条旧消息缺少上下文索引，无法安全修改。" };
            nextContext = nextContext.map((entry, index) =>
                entry.role === "assistant" && entry.turn === message.id
                    ? { ...entry, content: index === lastAssistantIndex ? content : "" }
                    : entry,
            );
        }
    }

    updateSession(sessionId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        context: nextContext,
        messages: current.messages.map((candidate) =>
            candidate.id === msgId
                ? { ...candidate, content, images: images?.length ? images : undefined, files: files?.length ? files : undefined, segments: undefined }
                : candidate,
        ),
    }));
    return { ok: true };
}

/** 修改用户消息并重新生成。只允许截断没有工具副作用的纯对话。 */
export function editAndResendQaMessage(
    sessionId: string,
    msgId: string,
    content: string,
    images?: string[],
    files?: QaTextAttachment[],
): QaMessageEditResult {
    if (!content.trim() && !images?.length && !files?.length) return { ok: false, reason: "消息内容不能为空。" };
    const filesError = validateQaTextAttachments(files);
    if (filesError) return { ok: false, reason: filesError };
    const blocked = getQaEditAndResendBlockReason(sessionId, msgId);
    if (blocked) return { ok: false, reason: blocked };

    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session || activeSessionId !== sessionId) return { ok: false, reason: "当前会话已经切换，请重新操作。" };
    const messageIndex = session.messages.findIndex((message) => message.id === msgId);
    if (messageIndex < 0) return { ok: false, reason: "消息已不存在。" };
    const removedTurns = resendTurnIds(session, messageIndex);
    const prefixContext = session.context?.filter((entry) => !entry.turn || !removedTurns.has(entry.turn));

    updateSession(sessionId, (current) => ({
        ...current,
        messages: current.messages.slice(0, messageIndex),
        context: prefixContext,
        updatedAt: Date.now(),
    }));
    void sendQaMessage(content, images, files);
    return { ok: true };
}

function updateSession(sessionId: string, updater: (session: QaSession) => QaSession, options?: { persist?: boolean }) {
    sessions = sessions
        .map((s) => (s.id === sessionId ? updater(s) : s))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    publish(options);
}

export function stopQaGeneration() {
    abortController?.abort();
}

function autoTitle(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact || "新对话";
}

export async function sendQaMessage(
    text: string,
    images?: string[],
    files?: QaTextAttachment[],
    options?: { /** true=不显示用户气泡，只把指令写入上下文（重试续接等内部续发用） */ silentUser?: boolean },
): Promise<void> {
    const trimmed = text.trim();
    if ((!trimmed && !images?.length && !files?.length) || isGenerating || isCompacting || validateQaTextAttachments(files)) return;

    let session = getActiveSession();
    if (!session) {
        createQaSession();
        session = getActiveSession();
        if (!session) return;
    }
    const sessionId = session.id;

    const nextEntry: QaContextEntry = {
        role: "user",
        content: trimmed || "（用户发来图片或附件）",
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
    };
    // 当前内容加上新消息将触顶时，先压缩再开新轮。
    const nextUsage = contextUsageOf(session) + entryChars(nextEntry) / getContextBudget();
    if (nextUsage >= 1) {
        await compactSessionContext(sessionId);
    }

    const userMsg: QaMsg = {
        id: makeId(),
        role: "user",
        content: trimmed,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
        ts: Date.now(),
    };
    const assistantMsg: QaMsg = { id: makeId(), role: "assistant", content: "", ts: Date.now() };

    updateSession(sessionId, (s) => ({
        ...s,
        title: s.messages.length === 0 ? autoTitle(trimmed || "（图片/附件）") : s.title,
        updatedAt: Date.now(),
        messages: [...s.messages, ...(options?.silentUser ? [] : [userMsg]), assistantMsg].slice(-MAX_MESSAGES_PER_SESSION),
        context: [...sessionContext(s), { ...nextEntry, turn: assistantMsg.id }],
    }));

    isGenerating = true;
    const controller = new AbortController();
    abortController = controller;
    emit();

    let streamedContent = "";
    let streamedReasoning = "";
    let toolStatuses: QaToolStatus[] = [];
    let segments: QaSegment[] = [];
    let stagedCommit: QaPendingCommit | undefined;
    let lastPaintAt = 0;
    let lastPaintLength = 0;

    const paintAssistant = (patch: Partial<QaMsg>, options?: { persist?: boolean; force?: boolean }) => {
        const now = Date.now();
        if (!options?.force && streamedContent.length - lastPaintLength < 64 && now - lastPaintAt < 150) return;
        lastPaintAt = now;
        lastPaintLength = streamedContent.length;
        updateSession(
            sessionId,
            (s) => ({
                ...s,
                updatedAt: Date.now(),
                messages: s.messages.map((m) => {
                    if (m.id !== assistantMsg.id) return m;
                    const next = { ...m, ...patch };
                    // ── 提交状态保护（防「已应用」被过期快照覆盖）──
                    // stagedCommit 是本回合的闭包变量，流式收尾那一次 paintAssistant 会把
                    // onStageCommit 时的旧快照（status: pending）再写一遍。若用户已点「应用」
                    // 并成功提交，这次写回会把 applied 覆盖成 pending 并持久化——刷新后
                    // 「应用」按钮复活甚至导致重复提交。这里守住：已落地的状态不允许被降级。
                    const incoming = patch.pendingCommit;
                    if (incoming && m.pendingCommit) {
                        const current = m.pendingCommit;
                        const currentSettled = current.status === "applied" || current.status === "reverted";
                        if (currentSettled && incoming.status !== current.status) {
                            return { ...next, pendingCommit: current };
                        }
                        // 已有提交结果（sha）时，也不接受把 result 清空或换掉
                        if (current.result?.sha && !incoming.result?.sha) {
                            return { ...next, pendingCommit: { ...incoming, result: current.result, status: current.status } };
                        }
                    }
                    return next;
                }),
            }),
            { persist: options?.persist !== false },
        );
    };

    const toolLabel = (name: string): string => QA_TOOLS.find((t) => t.name === name)?.name ?? name;

    // 工具行的参数/结果只存 UI 需要的头部：完整内容只属于模型上下文，
    // 90k 级的读取结果整条进渲染与持久层会把低端机拖垮
    const clipForUi = (text: string | undefined): string | undefined => {
        if (text == null) return undefined;
        return text.length > 4000 ? `${text.slice(0, 4000)}\n…（已截断，完整内容共 ${text.length.toLocaleString()} 字符）` : text;
    };

    try {
        const history = (getActiveSession()?.messages ?? [])
            .filter((m) => m.id !== assistantMsg.id && !m.error)
            .map((m) => ({ role: m.role, content: m.content }));
        const contextForTurn = sessionContext(sessions.find((s) => s.id === sessionId) ?? session);

        const autoCommit = loadQaGithubConfig()?.writeMode === "auto";
        await callQaAgent(history, {
            signal: controller.signal,
            autoCommit,
            context: contextForTurn,
            onContext: (entry) => {
                updateSession(
                    sessionId,
                    (s) => ({ ...s, context: [...sessionContext(s), { ...entry, turn: assistantMsg.id }] }),
                    { persist: false },
                );
            },
            callbacks: {
                onDelta: (delta) => {
                    streamedContent += delta;
                    const last = segments[segments.length - 1];
                    if (last?.kind === "text") {
                        segments = [...segments.slice(0, -1), { kind: "text", text: last.text + delta }];
                    } else {
                        segments = [...segments, { kind: "text", text: delta }];
                    }
                    paintAssistant({ content: streamedContent, reasoning: streamedReasoning, segments }, { persist: false });
                },
                onReasoningDelta: (delta) => {
                    streamedReasoning += delta;
                    paintAssistant({ reasoning: streamedReasoning }, { persist: false });
                },
                onToolStart: (name, args) => {
                    const detail = args && Object.keys(args).length > 0 ? clipForUi(JSON.stringify(args, null, 2)) : undefined;
                    const subtitle = formatQaToolSubtitle(name, args) || undefined;
                    const status: QaToolStatus = { name: toolLabel(name), running: true, detail, subtitle };
                    toolStatuses = [...toolStatuses, status];
                    segments = [...segments, { kind: "tool", tool: status }];
                    paintAssistant({ tools: toolStatuses, segments }, { force: true, persist: false });
                },
                // 引擎静默续接时给用户一行可见说明——否则模型突然谈"被截断"显得没头没脑
                onAutoContinue: (reason) => {
                    const status: QaToolStatus = {
                        name: "自动续写",
                        running: false,
                        success: true,
                        subtitle: reason === "truncated" ? "输出到达单次上限被截断，已自动接力" : "分段未完，自动继续",
                    };
                    toolStatuses = [...toolStatuses, status];
                    segments = [...segments, { kind: "tool", tool: status }];
                    paintAssistant({ tools: toolStatuses, segments }, { force: true, persist: false });
                },
                onToolDone: (name, success, result) => {
                    let patched = false;
                    const done: QaToolStatus[] = [];
                    toolStatuses = toolStatuses.map((t) =>
                        !patched && t.running && t.name === toolLabel(name)
                            ? ((patched = true), done[0] = { ...t, running: false, success, result: clipForUi(result) }, done[0])
                            : t,
                    );
                    if (done[0]) {
                        let segPatched = false;
                        segments = segments.map((seg) =>
                            !segPatched && seg.kind === "tool" && seg.tool.running && seg.tool.name === toolLabel(name)
                                ? ((segPatched = true), { kind: "tool" as const, tool: done[0] })
                                : seg,
                        );
                    }
                    paintAssistant({ tools: toolStatuses, segments }, { force: true, persist: false });
                },
                onStageCommit: (proposal) => {
                    stagedCommit = { proposal, status: "pending" };
                    paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: false });
                },
                // 注意：paintAssistant 内置提交状态保护——已 applied/reverted 的卡片
                // 不会被这里的过期快照（pending）覆盖，详见 paintAssistant 注释。
                // 全自动模式：工具内当场提交，保证同一轮里「创建PR」等后续工具看到已落地的提交
                commitNow: async (proposal) => {
                    const config = loadQaGithubConfig();
                    if (!config) {
                        stagedCommit = { proposal, status: "canceled", error: "仓库配置已丢失。" };
                        paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: false });
                        return { ok: false, error: "仓库配置已丢失。" };
                    }
                    stagedCommit = { proposal, status: "applying" };
                    paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: false });
                    try {
                        const result = await commitQaFiles(config, proposal, controller.signal);
                        stagedCommit = { proposal, status: "applied", result };
                        paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: true });
                        return { ok: true, htmlUrl: result.htmlUrl };
                    } catch (error) {
                        const message = formatQaErrorMessage(error);
                        // 与确认模式同构：失败后再核对一次仓库现状。
                        // 422 Not a fast forward 这类错误往往意味着提交其实已落地，
                        // 直接回退 pending 会让用户重复提交。
                        try {
                            const after = await verifyQaCommitApplied(config, proposal, controller.signal);
                            if (after.applied) {
                                stagedCommit = {
                                    proposal,
                                    status: "applied",
                                    result: {
                                        sha: after.sha ?? "",
                                        branch: proposal.branch ?? "",
                                        parentSha: after.headSha ?? "",
                                        htmlUrl: after.htmlUrl ?? "",
                                        fileCount: proposal.files.length + (proposal.deletes?.length ?? 0),
                                        reconciled: true,
                                    },
                                    verifiedAt: Date.now(),
                                    verifyNote: after.reason,
                                };
                                paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: true });
                                return { ok: true, htmlUrl: after.htmlUrl };
                            }
                            if (after.inconclusive) {
                                stagedCommit = {
                                    proposal,
                                    status: "unverified",
                                    verifyNote: `${message}；随后核对仓库现状也未成功（${after.reason}）`,
                                    verifiedAt: Date.now(),
                                    error: message,
                                };
                                paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: true });
                                return { ok: false, error: message };
                            }
                        } catch {
                            stagedCommit = {
                                proposal,
                                status: "unverified",
                                verifyNote: `${message}；随后核对仓库现状异常，状态待确认。`,
                                verifiedAt: Date.now(),
                                error: message,
                            };
                            paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: true });
                            return { ok: false, error: message };
                        }
                        stagedCommit = { proposal, status: "pending", error: message, lastAttemptAt: Date.now() };
                        paintAssistant({ pendingCommit: stagedCommit }, { force: true, persist: true });
                        return { ok: false, error: message };
                    }
                },
                onToolDrafting: (drafting) => {
                    paintAssistant({ toolDrafting: drafting || undefined }, { force: true, persist: false });
                },
                onStreamFallback: (reason) => {
                    paintAssistant(
                        { streamNote: `流式传输中断，已切换为整段获取——需等完整生成后一次性显示，请稍候。原因：${reason}` },
                        { force: true, persist: false },
                    );
                },
                onContentCreated: (item) => {
                    updateSession(
                        sessionId,
                        (s) => {
                            const rest = (s.createdContent ?? []).filter(
                                (c) => !(c.type === item.type && c.refId === item.refId),
                            );
                            return { ...s, createdContent: [...rest, item] };
                        },
                        { persist: true },
                    );
                },
            },
        });
        paintAssistant(
            {
                content: streamedContent,
                reasoning: streamedReasoning || undefined,
                tools: toolStatuses.length ? toolStatuses : undefined,
                segments: segments.length ? segments : undefined,
                pendingCommit: stagedCommit,
                toolDrafting: undefined,
            },
            { force: true },
        );
        // 全自动模式下提交已在工具内完成（commitNow）；这里只兜底处理提交失败留下的待办提案
        if (autoCommit && stagedCommit?.status === "pending" && !stagedCommit.error) {
            await applyQaCommit(assistantMsg.id);
            // 兜底提交也会更新 stagedCommit 之外的消息状态；重新读回最新状态，
            // 避免后面若还有 paintAssistant 调用时拿旧快照覆盖（保护逻辑已内置，双保险）
            const latest = sessions.find((s) => s.id === sessionId)?.messages.find((m) => m.id === assistantMsg.id)?.pendingCommit;
            if (latest) stagedCommit = latest;
        }
        // 本轮结束后触顶：立即压缩（进度条回到低位）
        if (contextUsageOf(sessions.find((s) => s.id === sessionId) ?? null) >= 1) {
            await compactSessionContext(sessionId);
        }
    } catch (error) {
        const finalTools = toolStatuses.length ? toolStatuses.map((t) => (t.running ? { ...t, running: false } : t)) : undefined;
        const finalSegments = segments.length
            ? segments.map((seg) => (seg.kind === "tool" && seg.tool.running ? { kind: "tool" as const, tool: { ...seg.tool, running: false } } : seg))
            : undefined;
        if (controller.signal.aborted) {
            // 中断续接：已执行的工具调用/结果已在上下文里；这里补齐悬空的原生调用结果、
            // 记录已流出的可见文本，下一轮「继续」能接上，原生协议也不会因缺 tool 结果报错
            updateSession(sessionId, (s) => {
                const entries = sessionContext(s);
                const turnEntries = entries.filter((entry) => entry.turn === assistantMsg.id);
                const answered = new Set(turnEntries.filter((entry) => entry.role === "tool" && entry.toolCallId).map((entry) => entry.toolCallId));
                const patches: QaContextEntry[] = [];
                for (const entry of turnEntries) {
                    if (entry.role !== "assistant") continue;
                    for (const call of entry.toolCalls ?? []) {
                        if (call.id && !answered.has(call.id)) {
                            patches.push({ role: "tool", toolCallId: call.id, name: call.name, content: "（用户中断，本次调用未完成）", turn: assistantMsg.id });
                        }
                    }
                }
                if (streamedContent.trim() || patches.length > 0) {
                    patches.push({
                        role: "assistant",
                        content: `${streamedContent.trim()}\n（本轮被用户中断，回复「继续」可接着做）`.trim(),
                        turn: assistantMsg.id,
                    });
                }
                return patches.length > 0 ? { ...s, context: [...entries, ...patches] } : s;
            });
            paintAssistant(
                { content: streamedContent, reasoning: streamedReasoning || undefined, tools: finalTools, segments: finalSegments, aborted: true, toolDrafting: undefined },
                { force: true },
            );
        } else {
            // 报错续接：与中断同构——已执行的工具结果保留在上下文，补齐悬空原生调用，
            // 记录已流出的文本；「重试」据此从中断处继续，而不是整轮作废重来
            const reason = formatQaErrorMessage(error);
            updateSession(sessionId, (s) => {
                const entries = sessionContext(s);
                const turnEntries = entries.filter((entry) => entry.turn === assistantMsg.id);
                const answered = new Set(turnEntries.filter((entry) => entry.role === "tool" && entry.toolCallId).map((entry) => entry.toolCallId));
                const patches: QaContextEntry[] = [];
                for (const entry of turnEntries) {
                    if (entry.role !== "assistant") continue;
                    for (const call of entry.toolCalls ?? []) {
                        if (call.id && !answered.has(call.id)) {
                            patches.push({ role: "tool", toolCallId: call.id, name: call.name, content: "（本次调用因报错未完成）", turn: assistantMsg.id });
                        }
                    }
                }
                if (streamedContent.trim() || patches.length > 0) {
                    patches.push({
                        role: "assistant",
                        content: `${streamedContent.trim()}\n（本轮执行到一半因报错中断：${reason.slice(0, 200)}）`.trim(),
                        turn: assistantMsg.id,
                    });
                }
                return patches.length > 0 ? { ...s, context: [...entries, ...patches] } : s;
            });
            paintAssistant(
                { content: streamedContent, reasoning: streamedReasoning || undefined, tools: finalTools, segments: finalSegments, error: reason, toolDrafting: undefined },
                { force: true },
            );
        }
    } finally {
        isGenerating = false;
        if (abortController === controller) abortController = null;
        emit();
    }
}

/** 重试 = 续接：保留本轮已产出的文字与工具结果（已在上下文里），从中断处继续，
 *  而不是把半途成果整轮作废重来。失败消息本身保留（去掉报错态），下方接续新回复。 */
export async function retryQaMessage(assistantMsgId: string): Promise<void> {
    const session = getActiveSession();
    if (!session || isGenerating) return;
    const failed = session.messages.find((m) => m.id === assistantMsgId);
    if (!failed) return;
    const hadProgress = Boolean(failed.content.trim() || failed.tools?.length);
    // 失败消息转为普通历史：撤下报错条与重试按钮；若毫无产出则直接移除避免留空壳
    updateSession(session.id, (s) => ({
        ...s,
        messages: hadProgress
            ? s.messages.map((m) => (m.id === assistantMsgId ? { ...m, error: undefined } : m))
            : s.messages.filter((m) => m.id !== assistantMsgId),
    }));
    await sendQaMessage(
        "上一轮执行中途失败。请从中断的地方继续完成剩余部分，已经完成的操作和说过的内容不要重复。",
        undefined,
        undefined,
        { silentUser: true },
    );
}

// ── 提交提案的确认 / 应用 / 撤销 ────────────────────

/**
 * 更新某条消息上的提交状态。
 *
 * 关键：默认强制持久化（publish）——提交状态是「钱一类的状态」，
 * 绝不能只留在内存里，否则刷新页面后会退回 pending 并重新出现「应用」按钮。
 * 另外支持 expectedStatus 乐观校验：状态已被别处改成 applied 时，
 * 不把旧快照（pending）回写覆盖，避免「提交成功却又变回可应用」。
 */
function patchPendingCommit(
    sessionId: string,
    msgId: string,
    patch: Partial<QaPendingCommit>,
    options?: {
        persist?: boolean;
        /** 仅当当前状态属于这些值时才写入（防止过期快照覆盖新状态） */
        onlyFrom?: QaPendingCommit["status"][];
    },
): boolean {
    let wrote = false;
    updateSession(
        sessionId,
        (s) => ({
            ...s,
            messages: s.messages.map((m) => {
                if (m.id !== msgId || !m.pendingCommit) return m;
                if (options?.onlyFrom && !options.onlyFrom.includes(m.pendingCommit.status)) return m;
                wrote = true;
                return { ...m, pendingCommit: { ...m.pendingCommit, ...patch } };
            }),
        }),
        { persist: options?.persist !== false },
    );
    return wrote;
}

function findMsgWithPending(msgId: string): { sessionId: string; pending: QaPendingCommit } | null {
    for (const session of sessions) {
        const msg = session.messages.find((m) => m.id === msgId);
        if (msg?.pendingCommit) return { sessionId: session.id, pending: msg.pendingCommit };
    }
    return null;
}

/**
 * 用户点「应用」：真正提交提案到 GitHub。
 *
 * 防重复提交的三道闸：
 *  1. 前置：只有 status === "pending" 且没有 result.commitSha 才继续；
 *  2. 提交前：先核对仓库现状，若提案内容已落地 → 直接记为 applied，不发提交请求；
 *  3. 提交失败：区分「确认未落地」（可重试）与「无法确认」（unverified，不给应用入口）。
 * 成功或形成结论后一律强制持久化，刷新页面不会退回 pending。
 */
export async function applyQaCommit(msgId: string): Promise<void> {
    const found = findMsgWithPending(msgId);
    if (!found) return;
    const { sessionId, pending } = found;
    // 闸 1：已落地 / 已有提交记录 / 正在处理中，一律拒绝重复应用
    if (pending.status !== "pending") return;
    if (pending.result?.sha) return;

    const config = loadQaGithubConfig();
    if (!config) {
        patchPendingCommit(sessionId, msgId, { status: "canceled", error: "仓库配置已丢失。" });
        return;
    }

    // 闸 2：提交前核对仓库现状，避免对已落地的提案重复提交（脏状态自愈）
    // lastAttemptAt 落盘：即使提交中途页面被刷新，重进工坊时自愈扫描也能识别出
    // 「点过应用但状态还在 pending」的卡片并去核对仓库，而不是重新给用户「应用」入口。
    patchPendingCommit(sessionId, msgId, { status: "applying", error: undefined, lastAttemptAt: Date.now() }, { persist: true });
    try {
        const precheck = await verifyQaCommitApplied(config, pending.proposal);
        if (precheck.applied) {
            // 内容已在仓库里：直接判定已应用，不再发提交请求
            patchPendingCommit(sessionId, msgId, {
                status: "applied",
                result: {
                    sha: precheck.sha ?? "",
                    branch: pending.proposal.branch ?? "",
                    parentSha: precheck.headSha ?? "",
                    htmlUrl: precheck.htmlUrl ?? "",
                    fileCount: pending.proposal.files.length + (pending.proposal.deletes?.length ?? 0),
                    reconciled: true,
                },
                verifiedAt: Date.now(),
                verifyNote: precheck.reason,
                error: undefined,
            }, { persist: true });
            return;
        }
        if (precheck.inconclusive) {
            // 读不到仓库现状：不冒险提交，也不谎称成功 → 待确认
            patchPendingCommit(sessionId, msgId, {
                status: "unverified",
                verifyNote: precheck.reason,
                verifiedAt: Date.now(),
                error: undefined,
            }, { persist: true });
            return;
        }
    } catch {
        // 核对本身异常不阻塞正常提交路径，继续走下面的真实提交
    }

    try {
        const result = await commitQaFiles(config, pending.proposal);
        // 闸 3（成功）：写入 sha 与结果，并强制持久化——刷新后仍是「已应用」
        patchPendingCommit(sessionId, msgId, {
            status: "applied",
            result,
            verifiedAt: Date.now(),
            verifyNote: undefined,
            error: undefined,
        }, { persist: true });
    } catch (error) {
        const message = formatQaErrorMessage(error);
        // 提交失败不等于未落地（如 422 Not a fast forward：提交其实已成功、只是无法快进）。
        // 重新核对一次：能确认已落地就记 applied，读不到就记 unverified（不给应用入口）。
        try {
            const after = await verifyQaCommitApplied(config, pending.proposal);
            if (after.applied) {
                patchPendingCommit(sessionId, msgId, {
                    status: "applied",
                    result: {
                        sha: after.sha ?? "",
                        branch: pending.proposal.branch ?? "",
                        parentSha: after.headSha ?? "",
                        htmlUrl: after.htmlUrl ?? "",
                        fileCount: pending.proposal.files.length + (pending.proposal.deletes?.length ?? 0),
                        reconciled: true,
                    },
                    verifiedAt: Date.now(),
                    verifyNote: after.reason,
                    error: undefined,
                }, { persist: true });
                return;
            }
            if (after.inconclusive) {
                patchPendingCommit(sessionId, msgId, {
                    status: "unverified",
                    verifyNote: `${message}；随后核对仓库现状也未成功（${after.reason}）`,
                    verifiedAt: Date.now(),
                    error: message,
                }, { persist: true });
                return;
            }
        } catch {
            // 核对抛错，按「无法确认」处理
            patchPendingCommit(sessionId, msgId, {
                status: "unverified",
                verifyNote: `${message}；随后核对仓库现状异常，状态待确认。`,
                verifiedAt: Date.now(),
                error: message,
            }, { persist: true });
            return;
        }
        // 明确未落地：回到 pending，允许用户重试
        patchPendingCommit(sessionId, msgId, { status: "pending", error: message, verifiedAt: Date.now() }, { persist: true });
    }
}

/** 用户点「取消」：丢弃提案，不提交。 */
export function cancelQaCommit(msgId: string): void {
    const found = findMsgWithPending(msgId);
    if (!found || found.pending.status !== "pending") return;
    patchPendingCommit(found.sessionId, msgId, { status: "canceled" });
}

/**
 * 对标记为 unverified 的提案做一次主动核对：确认已落地则升级为 applied。
 * 供 UI 上「重新核对」按钮与进入工坊时的自动修复调用。
 */
export async function recheckQaCommit(msgId: string): Promise<"applied" | "pending" | "unverified" | null> {
    const found = findMsgWithPending(msgId);
    if (!found) return null;
    const { sessionId, pending } = found;
    if (pending.status === "applied" || pending.result?.sha) return "applied";
    const config = loadQaGithubConfig();
    if (!config) return null;
    const result = await verifyQaCommitApplied(config, pending.proposal);
    if (result.applied) {
        patchPendingCommit(sessionId, msgId, {
            status: "applied",
            result: {
                sha: result.sha ?? "",
                branch: pending.proposal.branch ?? "",
                parentSha: result.headSha ?? "",
                htmlUrl: result.htmlUrl ?? "",
                fileCount: pending.proposal.files.length + (pending.proposal.deletes?.length ?? 0),
                reconciled: true,
            },
            verifiedAt: Date.now(),
            verifyNote: result.reason,
            error: undefined,
        }, { persist: true });
        return "applied";
    }
    if (result.inconclusive) {
        patchPendingCommit(sessionId, msgId, { status: "unverified", verifyNote: result.reason, verifiedAt: Date.now() }, { persist: true });
        return "unverified";
    }
    // 已确认未落地。若这张卡片本来就没被点过「应用」（没有尝试记录），
    // 不写入核对说明——保持提案的干净初始态，只在用户主动点过应用后才留痕。
    if (pending.lastAttemptAt) {
        patchPendingCommit(sessionId, msgId, { status: "pending", verifyNote: result.reason, verifiedAt: Date.now() }, { persist: true });
    }
    return "pending";
}

/**
 * 启动期状态自愈（只读，不创建任何提交）。
 *
 * 处理两类脏状态：
 *  a. 「点过应用但状态还是 pending」——提交其实成功，本地状态被覆盖（含旧版本遗留）；
 *  b. 当前会话里任何仍显示 pending 的提案——核对仓库现状，若内容已落地就改成 applied，
 *     避免用户对着早已提交的卡片再点一次「应用」产生重复 Commit。
 *
 * 以当前会话为主、限制数量上限，避免进入工坊时发起过多请求。
 * 核对不到的（网络/权限）不做武断结论，留给卡片上的「核对仓库现状」。
 */
export async function reconcileStaleQaCommits(options?: { maxChecks?: number }): Promise<number> {
    const config = loadQaGithubConfig();
    if (!config || isGenerating) return 0;
    const maxChecks = options?.maxChecks ?? 6;
    const targets: { sessionId: string; msgId: string; attempted: boolean }[] = [];
    // 当前会话排在最前：用户能直接看到修复效果
    const ordered = [
        ...sessions.filter((s) => s.id === activeSessionId),
        ...sessions.filter((s) => s.id !== activeSessionId),
    ];
    for (const session of ordered) {
        for (const message of session.messages) {
            const pending = message.pendingCommit;
            if (!pending || pending.status !== "pending") continue;
            if (pending.result?.sha) continue;
            targets.push({ sessionId: session.id, msgId: message.id, attempted: Boolean(pending.lastAttemptAt) });
        }
    }
    // 优先核对「点过应用」的（大概率是真脏状态），再补当前会话其余待办提案
    targets.sort((a, b) => Number(b.attempted) - Number(a.attempted));
    let fixed = 0;
    for (const target of targets.slice(0, maxChecks)) {
        try {
            const outcome = await recheckQaCommit(target.msgId);
            if (outcome === "applied" || outcome === "unverified") fixed += 1;
        } catch {
            // 单个核对失败不影响其它
        }
    }
    return fixed;
}

/** 用户点「撤销」：回退已应用的提交。 */
export async function revertQaAppliedCommit(msgId: string): Promise<void> {
    const found = findMsgWithPending(msgId);
    if (!found || found.pending.status !== "applied" || !found.pending.result) return;
    const config = loadQaGithubConfig();
    if (!config) return;
    patchPendingCommit(found.sessionId, msgId, { status: "reverting" });
    try {
        await revertQaCommit(config, found.pending.result);
        patchPendingCommit(found.sessionId, msgId, { status: "reverted" });
    } catch (error) {
        patchPendingCommit(found.sessionId, msgId, { status: "applied", error: formatQaErrorMessage(error) });
    }
}

// ── 跨会话记忆结转 ──────────────────────────────────
// 把当前会话浓缩成备忘录，开一个新会话继承记忆但重置 Token 空间。
// 供工坊 UI「结转新会话」与开放插件（workshop:runtime.carryOverSession）调用。

/**
 * 结转当前会话到新会话：压缩上下文为摘要 → 新建会话继承摘要 → 切换到新会话。
 * 返回新会话 id；失败或会话为空返回 null。
 */
export async function carryOverQaSession(sessionId: string): Promise<string | null> {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || isGenerating || isCompacting) return null;
    const entries = sessionContext(session);
    if (entries.length === 0) return null;

    isCompacting = true;
    emit();
    try {
        const summary = await compactQaContext(entries);
        if (!summary?.trim()) return null;

        const newId = makeId();
        const newSession: QaSession = {
            id: newId,
            title: `${session.title}（接续）`.slice(0, 80),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: makeId(),
                    role: "assistant",
                    content: `已承接上一会话「${session.title}」的关键记忆与进展。\n\n**前情备忘**：\n${summary}\n\n新窗口 Token 空间已重置，我们可以继续下一步。`,
                    ts: Date.now(),
                },
            ],
            context: [
                {
                    role: "user",
                    content: `[上一会话「${session.title}」的结转摘要备忘，供你延续上下文]\n${summary}`,
                },
                {
                    role: "assistant",
                    content: `已承接上一会话「${session.title}」的关键记忆与进展。新会话上下文已重置，可以继续下一步。`,
                },
            ],
        };

        sessions = [newSession, ...sessions].slice(0, MAX_SESSIONS);
        activeSessionId = newId;
        publish();
        return newId;
    } catch {
        return null;
    } finally {
        isCompacting = false;
        emit();
    }
}
