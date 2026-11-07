---
title: Message pair（消息对）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Message pair（消息对）

把用户消息和助手的流式回复放在一起，悬停时显示消息操作。

一组消息对包含一条用户消息，以及下方的助手回复。将指针悬停在回复上会显示复制和重新生成按钮。`bubble` 将用户消息放在有底色的气泡中，`flat` 只显示右对齐的文本。运行时版从会话中组合两条消息，独立版接收用户消息和要逐步显示的回复。

<demo react="assistant-ui/message-pair-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-message-pair"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-message-pair.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

会话会渲染成消息列表，其中包含用户消息和助手回复。用 `MessagePrimitive.Root` 分别包裹这两条消息，再给回复添加悬停操作栏。

### 组合用户消息和助手回复 {#compose-the-pair}

`ThreadPrimitive.Messages` 遍历会话中的消息。根据 `s.message.role` 渲染用户消息或助手回复。

```tsx
"use client";

import { MessagePrimitive, ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { paper } from "@/components/assistant-ui/elements/surfaces";

export function Turn() {
  return <ThreadPrimitive.Messages>{() => <TurnMessage />}</ThreadPrimitive.Messages>;
}

function TurnMessage() {
  const role = useAuiState((s) => s.message.role);
  return (
    <MessagePrimitive.Root className="flex w-full flex-col gap-5">
      {role === "user" ? (
        <div className={cn(paper, "max-w-[85%] self-end rounded-2xl px-3.5 py-2 text-sm")}>
          <MessagePrimitive.Parts />
        </div>
      ) : (
        <AssistantReply />
      )}
    </MessagePrimitive.Root>
  );
}
```

### 显示悬停时的操作 {#reveal-actions-on-hover}

在 `ActionBarPrimitive.Root` 上设置 `autohide="always"`，操作栏只在 `s.message.isHovering` 为 true 时渲染。`MessagePrimitive.Root` 会根据指针移入和移出来更新这个状态。

```tsx
import { ActionBarPrimitive } from "@assistant-ui/react";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { ghostButton } from "@/components/assistant-ui/elements/surfaces";

function AssistantReply() {
  return (
    <div className="group/message flex flex-col items-start">
      <div className="min-h-[4.25rem] text-sm leading-relaxed">
        <MessagePrimitive.Parts />
      </div>
      <ActionBarPrimitive.Root autohide="always" className="flex items-center gap-1 pt-1">
        <ActionBarPrimitive.Copy aria-label="复制回复" className={cn(ghostButton, "size-7")}>
          <CopyIcon className="size-3.5" />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload aria-label="重新生成响应" className={cn(ghostButton, "size-7")}>
          <RefreshCwIcon className="size-3.5" />
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </div>
  );
}
```

   `Thread` 元素具有相同的用户和助手组成，但其操作行使用 `autohide="not-last"`：在旧回复上悬停门控，在最新回复上始终可见。安装`@assistant-ui/thread`即可获取。

**独立版**

调用方保存完整的词列表和当前显示数量。组件负责淡入动画和显示末尾光标。

### 控制回复逐步显示 {#drive-the-reveal}

```tsx
"use client";

import { useEffect, useState } from "react";
import { MessagePair } from "@/components/assistant-ui/elements/message-pair";

const reply = "巴黎 是 法国 的 首都。".split(" ");

export function Turn() {
  const [visibleWords, setVisibleWords] = useState(0);
  const streaming = visibleWords < reply.length;

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => setVisibleWords((n) => n + 1), 120);
    return () => clearInterval(id);
  }, [streaming]);

  return (
    <MessagePair
      userMessage="法国的首都是哪里？"
      words={reply}
      visibleWords={visibleWords}
      streaming={streaming}
      onCopy={() => void navigator.clipboard?.writeText(reply.join(" "))}
      onRegenerate={() => setVisibleWords(0)}
    />
  );
}
```

### 处理悬停动作 {#handle-the-hover-actions}

传入 `onCopy` 和 `onRegenerate`，为对应按钮设置行为。省略回调时，组件会隐藏对应的按钮。

## 结构 {#anatomy}

```tsx
<div data-slot="message-pair">
  <p>{/* the sent message */}</p>
  <div>
    <p>{/* the reply, word by word */}</p>
    <div>{/* available actions, hidden until hover or focus */}</div>
  </div>
</div>
```

指针悬停或键盘焦点进入回复区域时，操作栏从透明变为可见。独立版按 `visibleWords` 逐步显示 `words`。新词会淡入，流式生成时最后两个词高亮，末尾显示闪烁的光标。运行时版会渲染已收到的文本，无需维护显示计数。默认 `Text` 渲染器通过 `MessagePartPrimitive.InProgress` 显示末尾圆点。

## 示例 {#examples}

### 气泡与纯文本布局 {#bubble-or-flat}

**运行时版**

运行时由调用方根据自己的 `variant` 选择用户消息的类名：

```tsx
<div
  className={
    variant === "flat"
      ? "text-foreground/90 self-end text-end text-sm"
      : cn(paper, "max-w-[85%] self-end rounded-2xl px-3.5 py-2 text-sm")
  }
>
```

**独立版**

`variant="flat"` 将用户消息显示为右对齐的纯文本，布局更紧凑。

```tsx
<MessagePair variant="flat" userMessage="..." words={words} visibleWords={n} streaming={false} />
```

### 回复来自哪里 {#where-the-reply-comes-from}

**运行时版**

助手生成回复时，`s.message.status?.type` 为 `"running"`，生成结束时为 `"complete"`。可以直接用这个值驱动界面中的流式状态。

```tsx
const streaming = useAuiState((s) => s.message.status?.type === "running");
```

**独立版**

当`visibleWords`到达`words.length`时流结束。附加一个新单词并增加计数器以使其继续运行，或者在源完成后设置 `streaming={false}`。

### 调整消息对的样式 {#restyle-the-pair}

两种用法都以 `className` 为根，并且来自 `surfaces.tsx` 的共享 `paper` 和 `ghostButton` 标记在使用它们的任何地方设置气泡和操作按钮的样式。

```tsx
<MessagePair className="max-w-none gap-3" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息片段 {#message-parts}

| 部分 | 渲染结果 | 说明 |
| --------------------------- | -------- | ----------------------------------------------------------------------------- |
| `MessagePrimitive.Root` | `div` | 跟踪操作行的悬停。将每条消息包装在一条消息中。 |
| `MessagePrimitive.Parts` | 片段 | 呈现消息的内容，包括流文本。 |
| `ActionBarPrimitive.Root` | `div` | `autohide="always"` 隐藏，直到 `message.isHovering` 为 true。 |
| `ActionBarPrimitive.Copy` | `button` | 尚未复制任何内容时已禁用。 |
| `ActionBarPrimitive.Reload` | `button` | 当会话正在运行或消息不是来自助手时禁用。 |

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `s.message.role` | `"user" \| "assistant" \| "system"` | 该消息属于该消息对的哪一半。 |
| `s.message.status?.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | 显示助手消息。`"running"` 同时仍在流式传输。 |
| `s.message.isHovering` | `boolean` | 根据指针移入和移出时由`MessagePrimitive.Root` 设置。 |
| `aui.message.reload()` | `(config?) => void` | 重新生成此辅助消息作为新的同级分支。 |

**独立版**

### MessagePair {#messagepair}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | -------------------- | ---------- | ---------------------------------------------------------------- |
| `userMessage` | `string` |  | 已发送消息，显示为气泡或扁线。 |
| `words` | `readonly string[]` |  | 完整回复，已分成文字。 |
| `visibleWords` | `number` |  | 从`words`开始显示多少个字。 |
| `streaming` | `boolean` |  | 为最新单词着色并在 true 时显示尾随光标。 |
| `variant` | `"bubble" \| "flat"` | `"bubble"` | 发送的消息如何呈现。 |
| `onCopy` | `() => void` |  | 渲染复制按钮并在激活时运行。 |
| `onRegenerate` | `() => void` |  | 渲染重新生成按钮并在激活时运行。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
