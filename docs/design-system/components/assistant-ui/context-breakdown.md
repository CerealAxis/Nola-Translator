---
title: Context breakdown（上下文明细）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Context breakdown（上下文明细）

按类型拆分 token 使用量，显示上下文窗口的占用情况。

<demo react="assistant-ui/context-breakdown-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-context-breakdown"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-context-breakdown.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 整理运行时提供的分段数据

从运行时提供的计量数据整理各段。可按应用拥有的数据区分消息、提示词、工具或其他类别。

```tsx
"use client";

import { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  ContextBreakdown,
  type ContextSegment,
} from "@/components/assistant-ui/elements/context-breakdown";

function useTurnUsage() {
  const messages = useAuiState((s) => s.thread.messages);
  return useMemo(() =>
    messages.reduce(
      (sum, message) => {
        for (const step of message.metadata.steps ?? []) {
          sum.input += step.usage?.inputTokens ?? 0;
          sum.output += step.usage?.outputTokens ?? 0;
        }
        return sum;
      },
      { input: 0, output: 0 },
    ),
    [messages],
  );
}

const MODEL_CONTEXT_WINDOW = 128_000;

export function ThreadContextBreakdown() {
  const usage = useTurnUsage();
  const segments: ContextSegment[] = [
    { label: "提示词", tokens: usage.input, tint: "bg-foreground/30" },
    { label: "回复", tokens: usage.output, tint: "bg-blue-500/70" },
  ];
  return <ContextBreakdown segments={segments} limit={MODEL_CONTEXT_WINDOW} />;
}
```

**独立使用**

### 传入分段与上限

传入按展示顺序排列的 segments 与总上限。

```tsx
"use client";

import { ContextBreakdown } from "@/components/assistant-ui/elements/context-breakdown";

const segments = [
  { label: "系统提示词", tokens: 1_400, tint: "bg-foreground/20" },
  { label: "工具", tokens: 3_100, tint: "bg-foreground/35" },
  { label: "会话", tokens: 42_000, tint: "bg-blue-500/70" },
];

export function ContextPanel() {
  return <ContextBreakdown segments={segments} limit={128_000} />;
}
```

## 结构 {#anatomy}

组件组合分段用量条和图例，按类别展示 token 数，汇总总量。

```tsx
<div data-slot="context-breakdown">
  <div>
    <span>上下文</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <div>{/* 显示进度 */}</div>
  <div>
    {/* 逐项渲染 */}
    <div>{/* 对应槽位内容 */}</div>
  </div>
</div>
```

剩余容量由上限减去全部分段用量得出，最低为 0，仅显示在图例中。`limit` 为 0 时按无压力处理。每段的 `tint` 同时用于分段与图例。

## 示例 {#examples}

### 选择分段色调

为分段分配可区分的色调。相同类型保持一致。

```tsx
{ label: "会话", tokens: 42000, tint: "bg-blue-500/70" }
```

### 调整面板样式

通过 `className` 调整根元素布局。

```tsx
<ContextBreakdown className="max-w-xs gap-2" segments={segments} limit={limit} />
```

## API 参考 {#api-reference}

**使用运行时**

### 会话状态

| 选择器 | 类型 | 说明 |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.thread.messages` | `readonly MessageState[]` | 当前会话的消息列表。 |

除输入与输出的 token 数之外，更细的分项与模型窗口大小由应用提供。

**独立使用**

### ContextBreakdown

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segments` | `readonly ContextSegment[]` | 必填 | 按展示顺序提供的用量分段。 |
| `limit` | `number` | 必填 | 配额或上下文窗口上限。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### ContextSegment

| 属性 | 类型 | 默认值 | 说明 |
| -------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| `label` | `string` | 必填 | 要显示的标签。 |
| `tokens` | `number` | 必填 | 该分段使用的 token 数。 |
| `tint` | `string` | 必填 | 该分段的颜色类别。 |

其余 `div` 属性会转发给根元素。
