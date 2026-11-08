---
title: Cost meter（费用计量）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Cost meter（费用计量）

按步骤展示运行成本，并汇总会话消耗。

<demo react="assistant-ui/cost-meter-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-cost-meter"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-cost-meter.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 将运行步骤转换为成本条目

从步骤的用量数据结合模型费率计算成本，生成 `CostLine`。

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";
import {
  CostMeter,
  type CostLine,
} from "@/components/assistant-ui/elements/cost-meter";

const PRICE_PER_MILLION = { in: 3, out: 15 };

function useRunCost(model: string): CostLine {
  const inputTokens = useAuiState((s) =>
    s.message.role === "assistant"
      ? s.message.metadata.steps.reduce(
          (total, step) => total + (step.usage?.inputTokens ?? 0),
          0,
        )
      : 0,
  );
  const outputTokens = useAuiState((s) =>
    s.message.role === "assistant"
      ? s.message.metadata.steps.reduce(
          (total, step) => total + (step.usage?.outputTokens ?? 0),
          0,
        )
      : 0,
  );
  const dollars =
    (inputTokens / 1_000_000) * PRICE_PER_MILLION.in +
    (outputTokens / 1_000_000) * PRICE_PER_MILLION.out;
  return { model, inputTokens, outputTokens, cost: `$${dollars.toFixed(2)}`, share: 1 };
}

export function RunCost({ model }: { model: string }) {
  const line = useRunCost(model);
  return <CostMeter runCost={line.cost} sessionCost={line.cost} lines={[line]} />;
}
```

### 添加会话合计

汇总当前运行以及整个会话已产生的成本，再传给组件。

```tsx
const sessionTokens = useAuiState((s) =>
  s.thread.messages.reduce(
    (total, message) =>
      message.role === "assistant"
        ? message.metadata.steps.reduce(
            (sum, step) =>
              sum + (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0),
            total,
          )
        : total,
    0,
  ),
);
```

**独立使用**

### 保存条目与合计

调用方也可直接保存成本明细和合计。

```tsx
"use client";

import {
  CostMeter,
  type CostLine,
} from "@/components/assistant-ui/elements/cost-meter";

const LINES: CostLine[] = [
  { model: "Opus 5", inputTokens: 48_200, outputTokens: 12_400, cost: "$1.66", share: 0.62 },
  { model: "Sonnet 5", inputTokens: 92_800, outputTokens: 21_100, cost: "$0.86", share: 0.29 },
  { model: "Haiku 4.5", inputTokens: 140_000, outputTokens: 8_900, cost: "$0.24", share: 0.09 },
];

export function Usage() {
  return <CostMeter runCost="$2.76" sessionCost="$18.40" lines={LINES} />;
}
```

## 结构 {#anatomy}

列表逐行显示项目名称、格式化成本和占比。底部显示本次和会话合计。

```tsx
<div data-slot="cost-meter">
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <span>this run</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <div>{/* 显示进度 */}</div>
  <div>
    {/* 逐项渲染 */}
  </div>
</div>
```

分段色调按数组索引确定。辅助技术可以读取各个可见分段的名称与占比，四舍五入后没有宽度的分段不会出现在条形中。

## 示例 {#examples}

### 调整成本计量样式

给根元素传入 `className`。

```tsx
<CostMeter className="max-w-none" /* ... */ />
```

### 从原始成本计算占比

用各行成本除以本次总成本。总成本为零时使用零占比。

```tsx
const raw = [
  { model: "Opus 5", inputTokens: 48_200, outputTokens: 12_400, dollars: 1.66 },
  { model: "Sonnet 5", inputTokens: 92_800, outputTokens: 21_100, dollars: 0.86 },
];
const total = raw.reduce((sum, r) => sum + r.dollars, 0);
const lines: CostLine[] = raw.map((r) => ({
  model: r.model,
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  cost: `$${r.dollars.toFixed(2)}`,
  share: total > 0 ? r.dollars / total : 0,
}));
```

## API 参考 {#api-reference}

**使用运行时**

### 消息与会话状态

| 选择器 | 类型 | 说明 |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.message.metadata.steps` | `readonly ThreadStep[]` | 消息的步骤元数据，用于读取用量。 |
| `s.thread.messages` | `readonly MessageState[]` | 当前会话的消息列表。 |

assistant-ui 记录 token 数，成本由应用根据费率计算。`ThreadStep` 没有模型名称，应用需另外记录每条消息使用的模型，才能计算 `cost`、`share` 和按模型分组的明细。

**独立使用**

### CostMeter

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | --------------------- | -------- | ---------------------------------------------------------------- |
| `runCost` | `string` | 必填 | 本次运行的格式化成本。 |
| `sessionCost` | `string` | 必填 | 当前会话的格式化成本。 |
| `lines` | `readonly CostLine[]` | 必填 | 按展示顺序提供的成本条目。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### CostLine

| 字段 | 类型 | 说明 |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model` | `string` | 当前模型。 |
| `inputTokens` | `number` | 输入 token 数。 |
| `outputTokens` | `number` | 输出 token 数。 |
| `cost` | `string` | 该项的格式化成本。 |
| `share` | `number` | 该项在本次运行成本中的占比。 |

其余 `div` 属性会转发给根元素。
