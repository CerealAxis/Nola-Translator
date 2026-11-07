---
title: Message queue（消息队列）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Message queue（消息队列）

列出生成期间排队的消息，允许在发送前取消。

当回复正在流式传输时，你接下来发送的消息不会被阻止或丢弃：它会堆叠在实时“正在运行”行的下方，并保持可取消状态，直到轮到它为止。对于运行时，队列是输入框自己的，在运行处于活动状态时通过正常发送来填充。在独立版中，你可以自己保存运行文本和列表。

<demo react="assistant-ui/message-queue-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-message-queue"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-message-queue.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

支持排队跟踪 `s.composer.queue` 上待处理发送的运行时。当 `s.thread.isRunning` 已经为 true 时，除了发送之外不需要添加任何特殊内容。

### 渲染队列 {#render-the-queue}

   `ComposerPrimitive.Queue` 映射到待处理项目。`QueueItemPrimitive.Text` 和 `.Remove` 读取当前范围内的值并对其执行操作。

```tsx
"use client";

import { ComposerPrimitive, QueueItemPrimitive, useAuiState } from "@assistant-ui/react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, ghostButton, mono } from "@/components/assistant-ui/elements/surfaces";

export function MessageQueue() {
  const queueLength = useAuiState((s) => s.composer.queue.length);

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {queueLength > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <span className={cn(mono, "text-muted-foreground")}>{queueLength} 已排队</span>
          <span className={cn(mono, "text-muted-foreground")}>完成后发送</span>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        <ComposerPrimitive.Queue>
          {({ queueItem }) => (
            <li
              key={queueItem.id}
              className={cn(field, "flex items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3")}
            >
              <span className="text-foreground/60 min-w-0 flex-1 truncate text-[13.5px]">
                <QueueItemPrimitive.Text />
              </span>
              <ArrowUpIcon className="text-foreground/25 size-3 shrink-0" />
              <QueueItemPrimitive.Remove aria-label="从队列中删除" className={cn(ghostButton, "size-6 shrink-0")}>
                <XIcon className="size-3.5" />
              </QueueItemPrimitive.Remove>
            </li>
          )}
        </ComposerPrimitive.Queue>
      </ul>
    </div>
  );
}
```

### 显示正在运行的内容 {#show-whats-running}

   运行提示文本没有像队列那样的单一选择器。当 `s.thread.isRunning` 为 true 时，它​​是最近发送的用户消息。

```tsx
const running = useAuiState((s) =>
  s.thread.isRunning ? [...s.thread.messages].reverse().find((m) => m.role === "user") : undefined,
);
```

   一旦 `running` 解析为消息，渲染独立元素使用的相同脉冲点行。用户消息的 `content` 是一个部分数组，而不是纯字符串，因此请自行加入文本部分：`running.content.filter((p) => p.type === "text").map((p) => p.text).join(" ")`。

**独立版**

在独立版中，`MessageQueue` 呈现你所传递的内容：正在运行的消息的文本以及其后面的排队消息数组。

### 维护生成中的文本和队列 {#hold-the-running-text-and-the-queue}

```tsx
"use client";

import { useState } from "react";
import { MessageQueue, type QueuedMessage } from "@/components/assistant-ui/elements/message-queue";

export function Queue() {
  const [queued, setQueued] = useState<QueuedMessage[]>([
    { id: "1", text: "现在添加对身份验证流程的测试" },
  ]);

  return (
    <MessageQueue
      running="Refactor the login form to use the new validation hook"
      queued={queued}
      onCancel={(id) => setQueued((q) => q.filter((m) => m.id !== id))}
    />
  );
}
```

### 运行完成后发送下一个 {#send-the-next-one-when-the-run-finishes}

   没有自动切换：运行完成后，将第一个排队项目移出数组，开始运行，然后使用较短的队列重新渲染。

## 结构 {#anatomy}

```tsx
<div data-slot="message-queue">
  <div>{/* running: pulsing dot, text, "running" badge */}</div>
  <div>{/* "n queued · sends when this finishes", only when queued.length > 0 */}</div>
  <ul>
    <li>{/* index, text, arrow, remove button only when onCancel is given */}</li>
  </ul>
</div>
```

只有一条消息正在“运行”。`onCancel` 专门针对排队的项目提供，每个项目在添加时都会淡出并滑入，键入项目的 ID，以便已经可见的项目不会重播动画。独立地，这是一个平面列表，除了数组位置之外没有顺序概念。在运行时，`s.composer.queue` 也可以使用 `aui.composer.queueItem({ id }).move({ insertAfter, insertBefore })` 重新排序，并且一个项目可以使用 `aui.composer.queueItem({ id }).move({ lane: "steer", insertAfter: null })` 跳到其余项目之前，这两个简单的视图都不会显示。排队本身是一种功能，而不是保证：在假设运行中发送进入队列而不是被拒绝之前检查 `s.thread.capabilities.queue`。

## 示例 {#examples}

### 将排队的消息移到前面 {#move-a-queued-message-to-the-front}

**运行时版**

`QueueItemPrimitive.Steer` 接下来运行排队的项目，而不是等待轮到它：

```tsx
<QueueItemPrimitive.Steer className={cn(ghostButton, "px-2 text-xs")}>
  立即运行
</QueueItemPrimitive.Steer>
```

**独立版**

没有内置重新排序功能。将按下的项目拼接到 `queued` 数组的前面并重新渲染。

```tsx
setQueued((q) => {
  const item = q.find((m) => m.id === id)!;
  return [item, ...q.filter((m) => m.id !== id)];
});
```

### 调整队列 {#restyle-the-queue}

两种用法都支持通过 `className` 调整根元素，`surfaces.tsx` 中的 `field`、`ghostButton` 和 `mono` 标记覆盖排队行、删除按钮和小型大写字母标签。

```tsx
<MessageQueue className="gap-3" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### ComposerPrimitive 和 QueueItemPrimitive {#composerprimitive-and-queueitemprimitive}

| 部分 | 渲染结果 | 说明 |
| --------------------------- | -------- | ------------------------------------------------------------- |
| `ComposerPrimitive.Queue` | 片段 | 按顺序对每个待处理队列项目进行渲染。 |
| `QueueItemPrimitive.Text` | `span` | 项目的文本部分，它们之间用空行连接。 |
| `QueueItemPrimitive.Remove` | `button` | 从队列中删除此项。 |
| `QueueItemPrimitive.Steer` | `button` | 接下来运行此项目而不是等待轮到它。 |

### 输入框状态 {#composer-state}

| 选择器 | 类型 | 说明 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `s.composer.queue` | `readonly { id: string; parts: ... }[]` | 待处理的发送，按队列顺序。 |
| `s.thread.isRunning` | `boolean` | 当消息正在运行时为真。 |
| `s.thread.capabilities.queue` | `boolean` | 此运行时是否对中运行发送进行排队。 |
| `aui.composer.queueItem({ id }).move(placement)` | `(placement: { lane?: "queue" \| "steer"; insertAfter?: string \| null; insertBefore?: string \| null }) => void` | 重新排序项目或将其移动到下一个运行。 |
| `aui.composer.queueItem({ id }).remove()` | `() => void` | 从队列中删除此项。 |

**独立版**

### MessageQueue {#messagequeue}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `running` | `string` |  | 当前运行消息的文本。 |
| `queued` | `readonly QueuedMessage[]` |  | 待处理消息，按顺序排列。 |
| `onCancel` | `(id: string) => void` |  | 当按下排队项目的删除按钮时调用。当提供此按钮时，该按钮仅针对排队的项目呈现。 |
| `className` | `string` |  | 合并到根元素。 |

`QueuedMessage` 是 `{ id: string; text: string }`。其余 `div` 属性会传给根元素。
