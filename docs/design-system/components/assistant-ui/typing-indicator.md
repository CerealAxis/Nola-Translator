---
title: Typing indicator（输入指示器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Typing indicator（输入指示器）

用三个圆点提示助手正在输入。

三个点在交错的波浪中弹跳，或者是裸露的，或者位于圆形气泡内。通过运行时，你可以在第一个标记落地之前将其安装在短暂的窗口中。独立的你自己显示和隐藏它。

<demo react="assistant-ui/typing-indicator-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-typing-indicator"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-typing-indicator.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

这在屏幕上只属于一个窗口：运行处于活动状态，最新消息尚未产生任何内容。点本身不依赖于运行时。只有渲染它的决定才起作用。

### 在收到首个 token 前显示 {#show-it-before-the-first-token}

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";
import { TypingIndicator } from "@/components/assistant-ui/elements/typing-indicator";

function AssistantTyping() {
  const waiting = useAuiState((s) => {
    if (!s.thread.isRunning) return false;
    const last = s.thread.messages.at(-1);
    return last?.role === "assistant" && last.parts.length === 0;
  });
  if (!waiting) return null;
  return <TypingIndicator />;
}
```

### 放在回复的渲染位置 {#place-it-where-the-reply-will-render}

   在内容开始到达后助手的消息正文将在同一位置渲染 `AssistantTyping`，因此当内容消失时不会发生任何变化。

**独立版**

独立版中，`TypingIndicator` 不带任何数据。安装和卸载完全取决于你。

### 在等待回复时显示 {#drop-it-in-while-you-wait}

```tsx
"use client";

import { useState } from "react";
import { TypingIndicator } from "@/components/assistant-ui/elements/typing-indicator";

export function Chat() {
  const [waiting, setWaiting] = useState(false);
  return waiting ? <TypingIndicator /> : null;
}
```

### 选择外观变体 {#choose-a-variant}

```tsx
<TypingIndicator variant="bare" />
```

## 示例 {#examples}

### 只显示圆点 {#bare-dots-without-the-bubble}

`variant="bare"` 丢弃圆形 `paper` 表面并仅渲染三个点，以便放置在你自己的容器内。

```tsx
<TypingIndicator variant="bare" className="gap-0.5" />
```

### 调整圆点 {#restyle-the-dots}

气泡变体将点包裹在来自 `surfaces.tsx` 的共享 `paper` 表面中。任一变体上的 `className` 仅影响最外面的元素（`"bubble"` 的气泡本身，`"bare"` 的点行）。点的颜色、大小和弹跳时间是固定的，不会作为属性暴露。

```tsx
<TypingIndicator className="px-3 py-2.5" />
```

## API 参考 {#api-reference}

**运行时版**

### 会话状态 {#thread-state}

| 选择器 | 类型 | 说明 |
| -------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `s.thread.isRunning` | `boolean` | 运行是否处于活动状态。 |
| `s.thread.messages` | `readonly MessageState[]` | `.at(-1)`为最新消息。带有空 `parts` 数组的辅助消息意味着还没有任何内容流入。 |

**独立版**

### TypingIndicator {#typingindicator}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------------------- | ---------- | ------------------------------------------------------------------------------- |
| `variant` | `"bubble" \| "bare"` | `"bubble"` | `"bubble"` 将点包裹在圆形表面中。`"bare"` 仅渲染点。 |
| `className` | `string` |  | 合并到根元素。 |

`role` 和 `aria-label` 由组件（`"status"` 和 `"Assistant is typing"`）固定，不是 prop 类型的一部分。除 `children` 和 `variant` 之外的所有其他 `div` 属性都会被转发。
