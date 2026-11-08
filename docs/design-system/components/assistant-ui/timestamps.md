---
title: Timestamps（时间戳）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Timestamps（时间戳）

在长会话中标记日期，悬停查看时间。

DaySeparator 将消息的平面列表显示为文本，每当日期更改时插入日期标题，并显示每条消息悬停的时间。通过运行时，你可以从会话自己的消息中派生该列表。独立的你已经持有它了。

<demo react="assistant-ui/timestamps-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-day-separator"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-day-separator.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

每条消息都携带一个真正的 `createdAt`（`Date`）和 `role`，并且会话的完整消息列表可作为纯状态使用，因此构建按天分组的形状是格式化和文本提取，而不是新的连线。

### 读取会话中的消息 {#read-the-threads-messages}

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";
import { DaySeparator, type DatedMessage } from "@/components/assistant-ui/elements/day-separator";

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function ThreadHistory() {
  const messages = useAuiState((s) => s.thread.messages);

  const dated: DatedMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      id: m.id,
      day: dayFormat.format(m.createdAt),
      time: timeFormat.format(m.createdAt),
      role: m.role === "user" ? "user" : "assistant",
      text: m.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join(" "),
    }));

  return <DaySeparator messages={dated} />;
}
```

   `s.thread.messages` 仅是当前分支：重新加载消息或编辑较早的消息会交换此处显示的消息，与会话中其他任何地方的操作方式相同。

### 只显示历史消息预览 {#keep-it-to-a-preview-not-the-transcript}

   扁平化为 `text` 会丢弃工具调用、图像和推理，因此这种组合适合紧凑的历史视图而不是实时对话。使用 `ThreadPrimitive.Messages` 和 `MessagePrimitive.Parts` 渲染会话本身，组合 `Thread` 已经发布，因此丰富的内容仍然在那里完整渲染。

**独立版**

独立的 DaySeparator 会立即获取整个列表：你保存该数组并随着对话的增长向其追加。

### 保留消息列表 {#hold-the-message-list}

```tsx
"use client";

import { useState } from "react";
import { DaySeparator, type DatedMessage } from "@/components/assistant-ui/elements/day-separator";

const MESSAGES: DatedMessage[] = [
  { id: "1", day: "Yesterday", time: "16:04", role: "user", text: "为什么草稿在重新加载后仍然存在？" },
  { id: "2", day: "Yesterday", time: "16:04", role: "assistant", text: "它是按线程持久化的。" },
];

export function History() {
  const [messages, setMessages] = useState(MESSAGES);
  return <DaySeparator messages={messages} />;
}
```

### 随着对话的发展追加 {#append-as-the-conversation-grows}

```tsx
setMessages((prev) => [
  ...prev,
  { id: crypto.randomUUID(), day: "Today", time: "09:12", role: "user", text },
]);
```

   当条目的 `day` 与之前的条目不同时，会自动出现日期标题。没有其他需要改变的。

## 结构 {#anatomy}

```tsx
<div data-slot="day-separator">
  {/* per message: an optional day header (rule, label, rule) when `day` differs from the previous entry, then the row */}
  <div>{/* user rows sit right-aligned in a filled bubble; assistant rows sit left-aligned as plain text */}</div>
</div>
```

日期比较仅查看前一个条目，因此列表必须已按时间顺序排列。无序条目重复一个标头，而不是合并到最后一个标头。默认情况下，每行的时间都是透明的，并且仅在悬停该行 (`group-hover`) 时淡入，因此列表保持安静，直到你查找时间戳。

## 示例 {#examples}

### 精简的历史消息视图 {#a-compact-history-not-the-live-transcript}

**运行时版**

将 `ThreadHistory` 与真正的 `Thread` 配对，例如作为可搜索侧边栏或“跳转到”列表，而不是代替它。选择一个条目是一个正常的分支或会话切换，而不是该组件自己执行的操作。

**独立版**

相同的形状适用于你自己未流式传输的只读转录本，例如从 API 获取整个转录本并在不附加任何运行时的情况下进行渲染。

### 调整分隔线和消息气泡 {#restyle-the-rule-and-bubble}

两种用法都支持通过 `className` 调整根元素。日期标签和悬停时间从 `surfaces.tsx` 读取共享的 `mono` 表面。

```tsx
<DaySeparator className="max-w-none gap-3" messages={messages} />
```

## API 参考 {#api-reference}

**运行时版**

### 会话状态 {#thread-state}

| 选择器 | 类型 | 说明 |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `s.thread.messages` | `readonly MessageState[]` | 会话当前分支上的每条消息，每条消息都带有 `id`、`role`、`createdAt` 和 `content`。 |
| `message.createdAt` | `Date` | 用于导出`day`和`time`。格式化是你自己的选择，而不是运行时提供的预先格式化的内容。 |
| `message.content` | `readonly ThreadAssistantMessagePart[] \| readonly ThreadUserMessagePart[]` | 过滤 `type === "text"` 部件以构建平面预览字符串。 |

**独立版**

### DaySeparator {#dayseparator}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------------- | -------- | --------------------------------- |
| `messages` | `readonly DatedMessage[]` |  | 要渲染的完整有序列表。 |
| `className` | `string` |  | 合并到根元素。 |

### DatedMessage {#datedmessage}

| 字段 | 类型 | 说明 |
| ------ | ----------------------- | ------------------------------------------------------------------------------- |
| `id` | `string` |  |
| `day` | `string` | 与上一个条目的 `day` 进行比较，以决定是否呈现标头。 |
| `time` | `string` | 显示在行悬停时。 |
| `role` | `"user" \| "assistant"` | 驱动对齐和气泡样式。 |
| `text` | `string` |  |

其余 `div` 属性会传给根元素。
