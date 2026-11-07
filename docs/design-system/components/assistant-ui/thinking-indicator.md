---
title: Thinking indicator（思考指示器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Thinking indicator（思考指示器）

显示助手当前的处理步骤，可附上已用时间。

圆点会循环闪动，标签在内容变化时淡入，也可附上用时徽章。运行时版从消息状态推导标签，再用定时器计算用时。独立版直接接收标签和用时。

<demo react="assistant-ui/thinking-indicator-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-thinking-indicator"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-thinking-indicator.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

运行时提供当前消息的各个内容片段。可从未完成的工具调用中取出工具名称作为标签。如果正在生成，但尚未收到任何内容，则显示「正在思考」。

### 从消息片段判断当前操作 {#name-what-is-happening-from-the-message-parts}

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";

function useThinkingLabel() {
  return useAuiState((s) => {
    if (s.message.status?.type !== "running") return undefined;
    const pending = s.message.parts.find(
      (part) => part.type === "tool-call" && part.result === undefined,
    );
    if (pending?.type === "tool-call") return `正在运行 ${pending.toolName}`;
    return s.message.parts.length === 0 ? "正在思考" : undefined;
  });
}
```

助手已输出可见文本且没有待处理的工具调用时，返回 `undefined`，以隐藏指示器并显示消息内容。

### 更新用时徽章 {#tick-the-elapsed-badge}

```tsx
import { useEffect, useState } from "react";
import { ThinkingIndicator } from "@/components/assistant-ui/elements/thinking-indicator";

function useElapsedLabel(active: boolean) {
  const [label, setLabel] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      setLabel(undefined);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setLabel(`${Math.round((Date.now() - start) / 1000)} 秒`);
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return label;
}

function AssistantThinking() {
  const label = useThinkingLabel();
  const elapsed = useElapsedLabel(label !== undefined);
  if (label === undefined) return null;
  return <ThinkingIndicator label={label} elapsed={elapsed} />;
}
```

`metadata.timing` 要等消息停止流式输出后才会定稿。若要实时显示用时，应在标签出现时启动计时器。

**独立版**

独立版直接接收字符串形式的 `label` 和 `elapsed`，并处理标签过渡和布局。

### 自行维护标签 {#hold-the-label-yourself}

```tsx
"use client";

import { useState } from "react";
import { ThinkingIndicator } from "@/components/assistant-ui/elements/thinking-indicator";

export function Status() {
  const [label, setLabel] = useState("正在思考");
  return <ThinkingIndicator label={label} />;
}
```

组件以标签字符串为键。更改 `label` 后，新标签会重新播放闪光和滑入动画。

### 添加用时 {#add-elapsed-time}

```tsx
<ThinkingIndicator label={label} elapsed="12 秒" />
```

省略 `elapsed` 即可隐藏徽章。传入空字符串时，徽章仍会渲染。

## 示例 {#examples}

### 显示待处理的工具调用 {#reacting-to-a-pending-tool-call}

更新标签即可。组件会以新标签为键重新播放淡入动画。

```tsx
const pending = message.parts.find(
  (part) => part.type === "tool-call" && part.result === undefined,
);
const label = pending?.type === "tool-call" ? `正在运行 ${pending.toolName}` : "正在思考";
```

### 调整状态行 {#restyle-the-status-line}

圆点使用 `bg-blue-500`，标签使用 `ShimmerLabel`，用时徽章沿用 `surfaces.tsx` 中的 `mono` 样式。`className` 会合并到根元素的默认样式 `text-muted-foreground flex items-center gap-2.5 text-sm`。

```tsx
<ThinkingIndicator label={label} elapsed={elapsed} className="gap-1.5 text-xs" />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.message.status` | `MessageStatus \| undefined` | `status.type === "running"` 表示助手正在生成此消息。 |
| `s.message.parts` | `readonly PartState[]` | 查找没有 `result` 的 `"tool-call"` 片段，可得知正在运行的工具。生成期间数组为空表示尚未收到内容。 |

**独立版**

### ThinkingIndicator {#thinkingindicator}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------------------- | -------- | ------------------------------------------------------------------------ |
| `label` | `string` |  | 状态文本。更改它会重新播放淡入动画。 |
| `elapsed` | `string \| undefined` |  | 标签后显示预格式化的经过时间。省略隐藏徽章。 |
| `className` | `string` |  | 合并到根元素。 |

除 `children` 之外的其余 `div` 属性会传给根元素。
