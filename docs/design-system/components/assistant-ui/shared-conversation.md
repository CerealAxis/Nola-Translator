---
title: Shared conversation（共享对话）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Shared conversation（共享对话）

以只读方式展示共享会话，并提供发起自己会话的入口。

<demo react="assistant-ui/shared-conversation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-shared-conversation"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-shared-conversation.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 用只读会话渲染记录

使用只读运行时载入共享记录，再用 `ThreadPrimitive` 和消息组件渲染会话。

```tsx
"use client";

import { ReadonlyThreadProvider, ThreadPrimitive, MessagePrimitive } from "@assistant-ui/react";
import type { ThreadMessage } from "@assistant-ui/react";

export function SharedThread({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <ReadonlyThreadProvider messages={messages}>
      <ThreadPrimitive.Viewport>
        <ThreadPrimitive.Messages>
          {() => <MessagePrimitive.Parts />}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
    </ReadonlyThreadProvider>
  );
}
```

### 提供进入新会话的入口

可将页面操作接到新会话，或按应用规则复制共享记录。

```tsx
import { useAui } from "@assistant-ui/react";
import type { ThreadMessage } from "@assistant-ui/react";

function ContinueButton({ messages }: { messages: readonly ThreadMessage[] }) {
  const app = useAui();
  return (
    <button
      onClick={() =>
        app.thread.import({
          messages: messages.map((message, i) => ({ message, parentId: messages[i - 1]?.id ?? null })),
        })
      }
    >
      在自己的会话中继续
    </button>
  );
}
```

**独立使用**

### 渲染共享卡片

独立版传入共享标题、元信息和消息正文。

```tsx
"use client";

import { SharedConversation } from "@/components/assistant-ui/elements/shared-conversation";

export function SharedCard({ onContinue }: { onContinue: () => void }) {
  return (
    <SharedConversation
      title="排查偶发失败的测试"
      sharedBy="周然"
      sharedAt="两天前"
      turns={[
        { id: "1", role: "user", text: "为什么这个测试只在 CI 中失败？" },
        { id: "2", role: "assistant", text: "很可能和时序假设有关…" },
      ]}
      onContinue={onContinue}
    />
  );
}
```

### 保持只读

仅连接分享页面允许的动作，保留只读展示。

## 结构 {#anatomy}

顶部显示共享信息和操作，下方按原顺序呈现消息。

```tsx
<div data-slot="shared-conversation">
  <div>{/* 显示名称或标题 */}</div>
  <div>{/* 对应槽位内容 */}</div>
  <div>
    <span>read only</span>
    <button>{/* 对应槽位内容 */}</button>
  </div>
</div>
```

继续会话是卡片内唯一的操作。共享内容应当是已完成的完整记录，加载或空列表由应用自行处理。

## 示例 {#examples}

### 调整页头样式

对标题和操作所在的外层使用 `className`。

```tsx
<SharedConversation title="一条会在空间不足时截断的很长会话标题" sharedBy="周然" sharedAt="Aug 12" turns={turns} />
```

### 空记录

没有消息时提供适当的空状态，仍可保留创建会话的入口。

## API 参考 {#api-reference}

**使用运行时**

### 基础组件

| 组成部分 | Renders | 说明 |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReadonlyThreadProvider` | children | 为共享记录提供只读会话上下文。 |
| `ThreadPrimitive.Viewport` / `.Messages` | `div` / children | 提供会话视口并渲染消息列表。 |

### 会话状态与能力

| 选择器 | 类型 | 说明 |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `s.thread.messages` | `readonly MessageState[]` | 当前会话的消息列表。 |
| `s.thread.isEmpty` | `boolean` | 当前会话是否没有消息。 |
| `s.thread.capabilities` | `RuntimeCapabilities` | 当前会话允许的操作。 |

**独立使用**

### SharedConversation

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | --------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| `title` | `string` | 必填 | 标题。 |
| `sharedBy` | `string` | 必填 | 分享者名称。 |
| `sharedAt` | `string` | 必填 | 分享时间。 |
| `turns` | `readonly SharedTurn[]` (`{ id, role: "user" \| "assistant", text }`) | 必填 | 要显示的会话记录。 |
| `onContinue` | `() => void` |  | 继续到自己的会话时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
