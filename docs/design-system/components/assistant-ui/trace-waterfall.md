---
title: Trace waterfall（追踪瀑布图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Trace waterfall（追踪瀑布图）

用瀑布图展示一次运行中各操作的相对起点、耗时和结果。

<demo react="assistant-ui/trace-waterfall-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-trace-waterfall"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-trace-waterfall.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 从消息和计时片段构建跨度

从消息计时和工具调用片段构造 spans。起点相对于整条消息的开始时间。

```tsx
"use client";

import { useAuiState, useMessageTiming } from "@assistant-ui/react";
import {
  TraceWaterfall,
  type TraceSpan,
} from "@/components/assistant-ui/elements/trace-waterfall";

function useMessageTrace(): { spans: TraceSpan[]; totalMs: number } {
  const timing = useMessageTiming();
  const parts = useAuiState((s) => s.message.parts);
  const totalMs = timing?.totalStreamTime ?? 0;

  const spans: TraceSpan[] = [
    {
      id: "message",
      name: "message",
      depth: 0,
      startMs: 0,
      durationMs: totalMs,
      status: totalMs > 0 ? "completed" : "running",
    },
  ];

  for (const [index, part] of parts.entries()) {
    if ((part.type !== "tool-call" && part.type !== "reasoning") || !part.timing)
      continue;
    const streamStart = timing?.streamStartTime ?? part.timing.startedAt;
    spans.push({
      id:
        part.type === "tool-call"
          ? `tool-${part.toolCallId}`
          : `reasoning-${index}`,
      name: part.type === "tool-call" ? part.toolName : "reasoning",
      depth: 1,
      startMs: Math.max(0, part.timing.startedAt - streamStart),
      durationMs: part.timing.completedAt
        ? part.timing.completedAt - part.timing.startedAt
        : 0,
      status:
        part.status.type === "running"
          ? "running"
          : part.status.type === "complete"
            ? "completed"
            : "failed",
    });
  }

  return { spans, totalMs };
}

export function MessageTrace() {
  const { spans, totalMs } = useMessageTrace();
  if (spans.length <= 1) return null;
  return (
    <TraceWaterfall spans={spans} totalMs={totalMs} visibleCount={spans.length} />
  );
}
```

### 自行组合追踪数据

自行读取消息状态与计时，构建视图数据。

**独立使用**

### 保存跨度与总耗时

由应用保存 spans 和总耗时，在同一时间刻度上呈现各条记录。

```tsx
"use client";

import { useState } from "react";
import {
  TraceWaterfall,
  type TraceSpan,
} from "@/components/assistant-ui/elements/trace-waterfall";

const SPANS: TraceSpan[] = [
  { id: "run", name: "run", depth: 0, startMs: 0, durationMs: 1840, status: "completed" },
  { id: "model", name: "chat.completions", depth: 1, startMs: 40, durationMs: 720, status: "completed" },
  { id: "search", name: "web_search", depth: 1, startMs: 790, durationMs: 460, status: "completed" },
];

export function Run() {
  const [visibleCount, setVisibleCount] = useState(0);
  return <TraceWaterfall spans={SPANS} totalMs={1840} visibleCount={visibleCount} />;
}
```

### 逐条显示跨度

通过 `visibleCount` 增加可见的跨度数量。

```tsx
useEffect(() => {
  if (visibleCount >= SPANS.length) return;
  const id = setTimeout(() => setVisibleCount((n) => n + 1), 700);
  return () => clearTimeout(id);
}, [visibleCount]);
```

## 结构 {#anatomy}

顶部显示运行耗时。每行包含操作、耗时和时间条。错误状态可在对应行显示。

```tsx
<div data-slot="trace-waterfall">
  <div>
    <span>执行追踪</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <div>
    {/* 逐项渲染 */}
  </div>
</div>
```

每条跨度的横向起点和长度分别由 `startMs`、`durationMs` 除以 `totalMs` 得到。只有新进入可见范围的条目会播放入场动画。

## 示例 {#examples}

### 调整瀑布图样式

通过 `className` 调整根元素。

```tsx
<TraceWaterfall className="max-w-none" /* ... */ />
```

### 标记失败跨度

给失败条目指定对应状态，保留开始时间和耗时。

**独立使用**

```tsx
{ id: "search", name: "web_search", depth: 1, startMs: 790, durationMs: 210, status: "failed" }
```

### 仅显示最近跨度

先截取需要的记录，再用原时间刻度传入总耗时。

```tsx
<TraceWaterfall spans={spans.slice(-6)} totalMs={totalMs} visibleCount={6} />
```

## API 参考 {#api-reference}

**使用运行时**

### 消息状态

| 选择器 | 类型 | 说明 |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useMessageTiming()` | `MessageTiming \| undefined` | 读取当前消息的运行计时。 |
| `s.message.parts` | `readonly PartState[]` | 消息中的文本、工具调用等片段。 |

追踪跨度由应用构造。`depth`、`id` 和状态的映射可参考 `useMessageTrace`。

**独立使用**

### TraceWaterfall

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ---------------------- | -------- | ------------------------------------------------------------------------- |
| `spans` | `readonly TraceSpan[]` | 必填 | 按顺序显示的跨度。 |
| `totalMs` | `number` | 必填 | 整次运行时长，单位为毫秒。 |
| `visibleCount` | `number` | 必填 | 可显示的条目数，限制在 0 和总条目数之间。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### TraceSpan

| 字段 | 类型 | 说明 |
| ------------ | -------------------------------------- | -------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `name` | `string` | 要显示的名称。 |
| `depth` | `number` | 条目的嵌套层数。 |
| `startMs` | `number` | 相对于运行开始的毫秒数。 |
| `durationMs` | `number` | 本次操作的耗时，单位为毫秒。 |
| `status` | `"running" \| "completed" \| "failed"` | 当前状态。工具等待用户操作时，status.type 为 requires-action。 |
