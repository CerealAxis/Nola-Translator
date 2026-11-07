---
title: Scroll anchor（滚动锚点）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Scroll anchor（滚动锚点）

在新消息增长时保留阅读位置，并让用户一键回到最新内容。

<demo react="assistant-ui/scroll-anchor-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-scroll-anchor"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-scroll-anchor.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 让视口跟随最新内容

使用 `ThreadPrimitive.Viewport` 管理自动滚动和滚动位置。

```tsx
"use client";

import { ThreadPrimitive } from "@assistant-ui/react";

function Viewport() {
  return (
    <ThreadPrimitive.Viewport className="relative h-64 w-full max-w-sm overflow-hidden rounded-2xl">
      <ThreadPrimitive.Messages>{({ message }) => null}</ThreadPrimitive.Messages>
    </ThreadPrimitive.Viewport>
  );
}
```

### 加入返回底部的按钮

通过 `ThreadPrimitive.ScrollToBottom` 提供回到最新消息的操作。

```tsx
import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";

<ThreadPrimitive.ScrollToBottom className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs disabled:invisible">
  <ArrowDownIcon className="size-3 opacity-60" />
  新消息
</ThreadPrimitive.ScrollToBottom>
```

**独立使用**

### 传入增长的消息列表

独立版提供会持续增加的列表并连接滚动锚点。

```tsx
"use client";

import { useState } from "react";
import { ScrollAnchor, type ScrollAnchorMessage } from "@/components/assistant-ui/elements/scroll-anchor";

const messages: ScrollAnchorMessage[] = [
  { role: "user", text: "请继续总结。" },
  { role: "assistant", text: "现在开始。" },
  { role: "assistant", text: "Here's the first section..." },
];

export function ScrollDemo() {
  const [paused, setPaused] = useState(false);
  return <ScrollAnchor messages={messages} paused={paused} onSettled={() => setPaused(true)} />;
}
```

### 响应重新跟随

用户回到底部后恢复跟随。需要时在回调中同步未读计数。

```tsx
<ScrollAnchor messages={messages} onSettled={() => console.log("已跟上最新消息")} />
```

## 结构 {#anatomy}

消息流位于滚动区域，离开底部时显示回跳操作。

```tsx
<div data-slot="scroll-anchor">
  <div>{/* 对应槽位内容 */}</div>
  <button>{/* 对应槽位内容 */}</button>
</div>
```

独立示例先显示三条消息，随后逐条添加。第四条会解除跟随并滚到顶部。离开底部后累计未读，满足条件时自动回到底部，也可点击提示立即返回。

## 示例 {#examples}

### 暂停消息增长

停止添加新内容，保留当前滚动位置。重新开始后继续由锚点规则决定是否跟随。

**独立使用**

```tsx
<ScrollAnchor messages={messages} paused={isMenuOpen} />
```

**使用运行时**

```tsx
<ThreadPrimitive.Viewport autoScroll={false}>
  {/* ... */}
</ThreadPrimitive.Viewport>
```

### 跳到指定消息

在应用中定位对应消息元素并滚动，而回到底部仍用内置操作。

**使用运行时**

```tsx
<ThreadPrimitive.Viewport turnAnchor="top">
  {/* ... */}
</ThreadPrimitive.Viewport>
```

## API 参考 {#api-reference}

**使用运行时**

### 基础组件

| 组成部分 | Renders | 说明 |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ThreadPrimitive.Viewport` | `div` | 提供会话的滚动视口。 |
| `ThreadPrimitive.ScrollToBottom` | `button` | 在离开底部时提供滚回最新消息的操作。 |

### 视口属性

| 属性 | 类型 | 默认值 | 说明 |
| ------------------------------ | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `autoScroll` | `boolean` | `true` (`false` when `turnAnchor="top"`) | 是否自动跟随新内容。 |
| `turnAnchor` | `"top" \| "bottom"` | `"bottom"` | 每轮消息的滚动锚定方式。 |
| `scrollToBottomOnRunStart` | `boolean` | `true` | 开始运行时是否滚动到底部。 |
| `scrollToBottomOnInitialize` | `boolean` | `true` | 初始化时是否滚动到底部。 |
| `scrollToBottomOnThreadSwitch` | `boolean` | `true` | 切换会话时是否滚动到底部。 |

**独立使用**

### ScrollAnchor

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `messages` | `ScrollAnchorMessage[]` (`{ role: "user" \| "assistant"; text: string }`) | 必填 | 按顺序提供的消息列表。 |
| `paused` | `boolean` | `false` | 是否暂停消息增长。 |
| `onSettled` | `() => void` |  | 已重新跟上消息时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
