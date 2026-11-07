---
title: Timeline（时间线）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Timeline（时间线）

按顺序呈现事件，区分已发生、当前和未来阶段。

<demo react="assistant-ui/timeline-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-timeline"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-timeline.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 注册渲染函数

为 get_incident_timeline 注册渲染器，等 result 可用再将 events 传给 Timeline。工具参数里的 `issueId` 是查找键。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { Timeline } from "@/components/assistant-ui/elements/timeline";

export const toolkit = defineToolkit({
  get_incident_timeline: {
    type: "backend",
    render: ({ args, result }) => {
      if (!result) return <p>Loading the timeline for {args.issueId}…</p>;
      return (
        <Timeline
          events={result.events}
          visibleCount={result.events.length}
        />
      );
    },
  },
});
```

### 由消息列表渲染

把工具包注册到运行时，消息列表会在调用位置显示时间线。

```tsx
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 直接传入事件

传入完整 events 和 `visibleCount`。初始可显示全部，也可从较少的事件开始。

```tsx
"use client";

import {
  Timeline,
  type TimelineEvent,
} from "@/components/assistant-ui/elements/timeline";

const events: readonly TimelineEvent[] = [
  { id: "1", when: "past", time: "09:02", title: "已提交问题" },
  { id: "2", when: "past", time: "09:40", title: "已复现" },
  { id: "3", when: "now", time: "10:15", title: "修复正在审核" },
  { id: "4", when: "future", time: "11:00", title: "Release 0.14.1" },
];

export function IssueTimeline() {
  return <Timeline events={events} visibleCount={events.length} />;
}
```

### 按需显示事件

由调用方调整 `visibleCount`。它会向下取整并限制在事件数内。

```tsx
"use client";

import { useEffect, useState } from "react";

export function IssueTimeline() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= events.length) return;
    const id = setTimeout(() => setVisibleCount((n) => n + 1), 600);
    return () => clearTimeout(id);
  }, [visibleCount]);

  return <Timeline events={events} visibleCount={visibleCount} />;
}
```

## 结构 {#anatomy}

每一行包含时间、事件标题和可选详情。when 决定圆点、连接线和标题的样式。

```tsx
<div data-slot="timeline">
  {/* 逐项渲染 */}
  <span>{/* 显示时间或耗时 */}</span>
  <span>
    {/* 对应槽位内容 */}
    {/* 对应槽位内容 */}
  </span>
  <div>
    <span>{/* event.title */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
</div>
```

`visibleCount` 向下取整。负数或 `NaN` 按 0 处理，超过数组长度时显示全部。事件保持传入顺序，最后一个可见事件之后不画连接线。

## 示例 {#examples}

### 过去、当前和未来

将 when 设为 "past"、"now" 或 "future"，标明不同阶段。

```tsx
const events: readonly TimelineEvent[] = [
  { id: "1", when: "past", time: "周一", title: "启动" },
  { id: "2", when: "now", time: "周三", title: "进行中" },
  { id: "3", when: "future", time: "周五", title: "截止" },
];
```

### 事件数据来源

运行时从工具结果读取事件，独立版可以使用应用已有的日志或状态。

**使用运行时**

```tsx
get_incident_timeline: tool({
  description: "查询已跟踪问题的时间线。",
  inputSchema: z.object({ issueId: z.string() }),
  execute: async ({ issueId }) => getIssueTimeline(issueId),
}),
```

**独立使用**

```tsx
async function loadTimeline(issueId: string) {
  const { events: nextEvents } = await fetchIssueTimeline(issueId);
  setEvents(nextEvents);
  setVisibleCount(0);
}
```

### 调整时间线样式

使用 `className` 调整根布局。

```tsx
<Timeline className="max-w-none gap-0" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 属性 | 类型 | 说明 |
| -------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `args` | `{ issueId: string }` | 工具调用参数，issueId 是模型提供的查询键。 |
| `result` | `{ events: TimelineEvent[] } \| undefined` | 已生成的时间线，后端执行器返回前为 undefined。 |

### get_incident_timeline 结果

| 字段 | 类型 | 说明 |
| ----------------- | ----------------------------- | ----------------------------------------------------------- |
| `events[].id` | `string` | 条目的稳定标识。 |
| `events[].when` | `"past" \| "now" \| "future"` | 事件所处阶段，控制圆点、连接线和标题样式。 |
| `events[].time` | `string` | 显示在时间列的文本。 |
| `events[].title` | `string` | 标题。 |
| `events[].detail` | `string` | 补充详情。 |

**独立使用**

### Timeline

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | -------------------------- | -------- | -------------------------------------------------------------------- |
| `events` | `readonly TimelineEvent[]` | 必填 | 事件的完整列表。按原顺序展示前 visibleCount 个。 |
| `visibleCount` | `number` | 必填 | 可显示的条目数，限制在 0 和总条目数之间。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### TimelineEvent

| 字段 | 类型 | 说明 |
| -------- | ----------------------------- | ----------------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `when` | `"past" \| "now" \| "future"` | 事件所处阶段，控制圆点、连接线和标题样式。 |
| `time` | `string` | 显示在时间列的文本。 |
| `title` | `string` | 标题。 |
| `detail` | `string` | 补充详情。 |
