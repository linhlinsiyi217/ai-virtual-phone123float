/**
 * 书房「一起读 / 一起看漫画」共读会话 — 临时聊天历史本地持久化（Phase 3A）。
 *
 * 设计边界（硬要求）：
 *   - 这里保存的是「本次共读对话」，按 角色 × 内容 维度存 kv-db，属于短期会话状态；
 *   - 它不是长期记忆，绝不写入 memory-storage；
 *   - 只有值得长期保留的事件才经 bookroom-ai-context 写入长期记忆。
 *
 * 复用项目现有 kv-db，不引入新数据库；前缀 bookroom-cosession: 与 reading-* 隔离。
 */
import { kvGet, kvSet } from "./kv-db";

export type CoSessionRole = "user" | "assistant" | "system";

export type CoSessionMessage = {
  id: string;
  role: CoSessionRole;
  content: string;
  createdAt: number;
};

const KEY_PREFIX = "bookroom-cosession:";
/** 单条会话最多保留的消息数，超出后丢弃最旧的（长期信息走记忆系统，不靠堆历史） */
const MAX_MESSAGES = 60;

function storageKey(roleId: string, contentId: string): string {
  return `${KEY_PREFIX}${roleId}::${contentId}`;
}

/** 读取某角色 × 某内容的共读会话历史；无记录 / 损坏时返回空数组 */
export function loadCoSession(roleId: string, contentId: string): CoSessionMessage[] {
  const raw = kvGet(storageKey(roleId, contentId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CoSessionMessage =>
        !!item
        && typeof item === "object"
        && typeof (item as CoSessionMessage).id === "string"
        && ["user", "assistant", "system"].includes((item as CoSessionMessage).role)
        && typeof (item as CoSessionMessage).content === "string",
    );
  } catch {
    return [];
  }
}

/** 覆盖式保存整条会话（自动裁剪长度） */
export function saveCoSession(roleId: string, contentId: string, messages: CoSessionMessage[]): void {
  const trimmed = messages.slice(-MAX_MESSAGES);
  kvSet(storageKey(roleId, contentId), JSON.stringify(trimmed));
}

/** 追加一条消息并落盘，返回裁剪后的最新会话 */
export function appendCoSessionMessage(
  roleId: string,
  contentId: string,
  message: Omit<CoSessionMessage, "id" | "createdAt"> & { id?: string; createdAt?: number },
): CoSessionMessage[] {
  const current = loadCoSession(roleId, contentId);
  const next: CoSessionMessage = {
    id: message.id ?? `co_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? Date.now(),
  };
  const merged = [...current, next];
  saveCoSession(roleId, contentId, merged);
  return merged.slice(-MAX_MESSAGES);
}
