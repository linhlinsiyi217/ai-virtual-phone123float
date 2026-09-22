// lib/chat-plugin-builtin.ts
// 聊天插件系统 · 内置插件注册表
//
// 随应用发货的插件走这里登记，不走"用户手动粘贴"那条路：
//   1. seedBuiltinChatPlugins() 把内置插件写入安装表（chat_plugins_v3），
//      因此在「聊天页 → 更多 → 扩展插件」里和普通插件一样可见、可停用、可卸载；
//   2. chat-plugin-runtime 装载时，记录里 code 为空的（内置记录）从本注册表取
//      模块对象；用户若手动安装了同 id 的版本（code 非空），以用户版本为准。
//
// 卸载内置插件会落一条"已卸载"标记，之后启动不再自动播种——
// 否则用户卸载完刷新页面它又回来，等于卸不掉。

import type { ChatPluginModule, InstalledChatPlugin } from "./chat-plugin-types";
import {
    loadChatPlugins,
    saveChatPlugins,
    loadDismissedBuiltinPlugins,
    markBuiltinPluginDismissed,
} from "./chat-plugin-storage";
import workshopOutlineMemoryCapsule from "./builtin-plugins/workshop-outline-memory-capsule";

const BUILTIN_CHAT_PLUGINS: ChatPluginModule[] = [
    workshopOutlineMemoryCapsule,
];

const builtinById = new Map(BUILTIN_CHAT_PLUGINS.map((plugin) => [plugin.manifest.id, plugin]));

export function getBuiltinChatPlugin(id: string): ChatPluginModule | null {
    return builtinById.get(id) ?? null;
}

export function listBuiltinChatPlugins(): ChatPluginModule[] {
    return [...BUILTIN_CHAT_PLUGINS];
}

export function isBuiltinChatPlugin(id: string): boolean {
    return builtinById.has(id);
}

/**
 * 把内置插件登记进安装表。幂等：
 *  - 已存在同 id 记录（内置或用户自装）→ 不动，保留用户的启停与设置；
 *  - 用户在管理页卸载过 → 不再播种（尊重明确的卸载意图）。
 * 返回本次新增的条数。
 */
export function seedBuiltinChatPlugins(): number {
    const existing = loadChatPlugins();
    const dismissed = loadDismissedBuiltinPlugins();
    const now = new Date().toISOString();
    let added = 0;

    for (const builtin of BUILTIN_CHAT_PLUGINS) {
        const id = builtin.manifest.id;
        if (existing.some((plugin) => plugin.manifest.id === id)) continue;
        if (dismissed.has(id)) continue;

        const defaults: Record<string, unknown> = {};
        for (const field of builtin.manifest.settings ?? []) {
            if (field.default !== undefined) defaults[field.key] = field.default;
        }

        const record: InstalledChatPlugin = {
            manifest: builtin.manifest,
            // 内置插件的实现随包发货，源码不落存储（置空 = 由内置注册表提供）
            code: "",
            enabled: true,
            builtin: true,
            installedAt: now,
            updatedAt: now,
            settings: defaults,
        };
        existing.push(record);
        added += 1;
    }

    if (added > 0) saveChatPlugins(existing);
    return added;
}

/** 卸载内置插件时调用：记入名单，避免下次启动又被播种回来 */
export function dismissBuiltinChatPlugin(id: string): void {
    if (isBuiltinChatPlugin(id)) markBuiltinPluginDismissed(id);
}