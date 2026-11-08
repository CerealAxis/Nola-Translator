---
title: Chat panel（聊天面板）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Chat panel（聊天面板）

将聊天消息、输入区域和运行状态组合成完整聊天面板。

<demo react="assistant-ui/chat-panel-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-chat-panel"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-chat-panel.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染消息列表

用 `ThreadPrimitive.Viewport` 与 `ThreadPrimitive.Messages` 渲染运行时消息。

```tsx
"use client";

import { ThreadPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { ChatPanel, ChatPanelMessages, ChatPanelUserMessage, ChatPanelAssistantMessage } from "./chat-panel";

export function LiveChatPanel() {
  return (
    <ChatPanel>
      <ThreadPrimitive.Viewport asChild>
        <ChatPanelMessages>
          <ThreadPrimitive.Messages>
            {({ message }) =>
              message.role === "user" ? (
                <ChatPanelUserMessage>
                  <MessagePrimitive.Parts />
                </ChatPanelUserMessage>
              ) : (
                <ChatPanelAssistantMessage>
                  <MessagePrimitive.Parts />
                </ChatPanelAssistantMessage>
              )
            }
          </ThreadPrimitive.Messages>
        </ChatPanelMessages>
      </ThreadPrimitive.Viewport>
    </ChatPanel>
  );
}
```

### 加入编辑器和运行状态

通过 `ComposerPrimitive` 添加输入和发送，用运行状态显示等待反馈。

```tsx
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { ChatPanelComposer, ChatPanelTyping } from "./chat-panel";

<AuiIf condition={(s) => s.thread.isRunning}>
  <ChatPanelTyping />
</AuiIf>

<ComposerPrimitive.Root className="mx-3 mb-3 flex h-10 shrink-0 items-center rounded-full">
  <ComposerPrimitive.Input placeholder="输入消息…" />
  <ComposerPrimitive.Send />
</ComposerPrimitive.Root>
```

**独立使用**

### 组合聊天面板

独立版用 `ChatPanel` 系列组件排列标题、消息区和编辑器。

```tsx
"use client";

import {
  ChatPanel,
  ChatPanelMessages,
  ChatPanelUserMessage,
  ChatPanelAssistantMessage,
  ChatPanelTyping,
  ChatPanelComposer,
} from "@/components/assistant-ui/elements/chat-panel";

export function Panel() {
  return (
    <ChatPanel>
      <ChatPanelMessages>
        <ChatPanelUserMessage>法国的首都是哪里？</ChatPanelUserMessage>
        <ChatPanelAssistantMessage>巴黎。</ChatPanelAssistantMessage>
        <ChatPanelTyping />
      </ChatPanelMessages>
      <ChatPanelComposer placeholder="输入消息…" onSend={() => {}} />
    </ChatPanel>
  );
}
```

### 处理消息发送

在发送回调中处理草稿和消息，更新列表与正在回复的状态。

```tsx
const [sending, setSending] = useState(false);

<ChatPanelComposer
  placeholder={sending ? "正在发送…" : "输入消息…"}
  onSend={!sending ? () => setSending(true) : undefined}
/>
```

## 结构 {#anatomy}

面板分为标题、消息内容区和编辑区。消息气泡、文本输入与输入中提示也可单独使用。

```tsx
<div data-slot="chat-panel">
  <div data-slot="chat-panel-messages">
    <div data-slot="chat-panel-user-message" />
    <p data-slot="chat-panel-assistant-message" />
    <div data-slot="chat-panel-typing" />
  </div>
  <div data-slot="chat-panel-composer">
    <span>{/* 对应槽位内容 */}</span>
    <button aria-label="发送" />
  </div>
</div>
```

独立的 `ChatPanelComposer` 提供编辑器外观。`placeholder` 是显示文案，发送行为通过 `onSend` 接入。没有发送回调时，按钮禁用。部分消息控件会在挂载时播放入场动画。

## 示例 {#examples}

### 单独复用子组件

按需要引用消息、提示或输入控件，放入已有聊天布局。

```tsx
<ChatPanel className="h-full max-w-none rounded-none border-none">
  {/* ... */}
</ChatPanel>
```

### 输入中状态

等待代理回复时显示反馈，收到内容或结束后清除。

**使用运行时**

```tsx
<AuiIf condition={(s) => s.thread.isRunning}>
  <ChatPanelTyping />
</AuiIf>
```

## API 参考 {#api-reference}

**使用运行时**

### 基础组件

| 组成部分 | Renders | 说明 |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `ThreadPrimitive.Viewport` | `div` | 提供会话的滚动视口。 |
| `ThreadPrimitive.Messages` | children | 按顺序渲染会话消息。 |
| `MessagePrimitive.Parts` | children | 遍历消息片段并渲染内容或工具 UI。 |
| `ComposerPrimitive.Root` / `.Input` / `.Send` | `form` / `textarea` / `button` | 组合运行时编辑器、输入框与发送按钮。 |
| `AuiIf` | children | 根据运行时状态条件渲染内容。 |

### 会话状态

| 选择器 | 类型 | 说明 |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `s.thread.isRunning` | `boolean` | 当前会话是否正在运行。 |
| `s.message.role` | `"user" \| "assistant" \| "system"` | 当前消息的角色。 |

**独立使用**

### ChatPanel family

| 组成部分 | Renders | Props | 说明 |
| --------------------------- | ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ChatPanel` | `div` | `className` | 整个聊天面板的外层容器。 |
| `ChatPanelMessages` | `div` | `className` | 放置消息列表的区域。 |
| `ChatPanelUserMessage` | `div` | `className` | 渲染用户消息。 |
| `ChatPanelAssistantMessage` | `p` | `className` | 渲染助手消息。 |
| `ChatPanelTyping` | `div` | `className` (no `children`) | 显示回复等待状态。 |
| `ChatPanelComposer` | `div` | `placeholder` (required `string`), `onSend?: () => void`, `className` | 提供消息输入和发送操作。 |

各部分会将其余属性转发给自身的根元素。
