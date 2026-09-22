# 工坊扩展插件（Workshop Plugins）

这个目录存放**基于工坊开放运行时**（`window.__WORKSHOP_RUNTIME__`）的扩展插件源码模板，供第三方参考与手动安装。

> **注意**：「工坊对话大纲与原生吸附胶囊」已经改为**内置插件**，随应用发货、启动时自动登记，
> **不需要**再手动粘贴安装（见下方「内置插件」一节）。本目录里的 `.js` 保留为独立模板副本。

## 工坊开放运行时（v2.0）

打开工坊 App 时，`components/phone-qa-app.tsx` 会在 `window` 上挂载运行时接口，并广播三个生命周期事件。

```ts
window.__WORKSHOP_RUNTIME__ = {
  version: "2.0.0",
  getContainer(): HTMLElement | null,          // 工坊消息滚动容器（.qa-body）
  getActiveSessionId(): string | null,         // 当前会话 id
  getMessages(): QaMsg[],                      // 当前会话消息列表（引用，不要修改）
  scrollToBottom(smooth?: boolean): void,      // 滚动到最新消息
  carryOverSession(sessionId?: string): Promise<string | null>,
  // ↑ 将指定会话（默认当前会话）浓缩为摘要开新会话；返回新会话 id
};

// 生命周期事件（都是 CustomEvent，detail 为 runtime 对象）
window.addEventListener("workshop:open",   e => { /* 工坊首次打开 */ });
window.addEventListener("workshop:update", e => { /* 会话切换 / 消息变化 */ });
window.addEventListener("workshop:close",  ()=> { /* 工坊卸载 */ });
```

关键 DOM class（供插件挂载与查询，宿主保证在 v2.0 起稳定）：

- `.qa-composer-wrap` — 输入栏外壳（`position: absolute`，插件把附加 UI 挂在这里最合适）
- `.qa-body` — 消息滚动容器（同 `runtime.getContainer()`）
- `.qa-header` — 顶栏
- `.qa-msg-wrap` — 单条消息外框；内含 `.qa-msg-user` 或 `.qa-msg-assistant`
- `.qa-drawer-menu-btn` — 抽屉三点菜单里的按钮
- `.qa-drawer-item.is-carrying` — 正在结转记忆的会话项（宿主已标记）

## 目录内容

| 文件 | 说明 |
| --- | --- |
| `workshop-outline-memory-capsule.js` | 工坊对话大纲与原生吸附胶囊 · V2.0 by 阿念。上滑显示轮次胶囊、点开显示大纲、快速跳转、跨会话记忆结转。 |

## 内置插件

随应用发货的插件登记在 `lib/chat-plugin-builtin.ts`，启动时由运行时播种进安装表
（`chat_plugins_v3`），与用户手动安装的插件完全同构：

- 管理页「聊天页 → 更多 → 扩展插件」里可见，带「内置」标注；
- 可停用、可卸载；卸载后会记入"已卸载"名单，不再自动播种（不会刷新即复活）；
- 用户手动安装同 id 的版本时，**以用户版本为准**（记录里的源码覆盖内置实现）。

要新增内置插件：把实现放到 `lib/builtin-plugins/<id>.ts` 并在
`lib/chat-plugin-builtin.ts` 的 `BUILTIN_CHAT_PLUGINS` 数组里登记即可。

## 手动安装步骤（第三方插件模板）

1. 打开虚拟手机的**聊天页**，点右上角「更多」→「插件管理」；
2. 「导入插件」→ 选择 / 粘贴目标 `.js` 文件的**完整源码**；
3. 安装成功后自动启用，进入工坊 App 即可看到扩展效果；
4. 卸载：插件管理页对应条目 → 卸载。
