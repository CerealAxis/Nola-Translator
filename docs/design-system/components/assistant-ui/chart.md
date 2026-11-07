---
title: Chart（图表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Chart（图表）

在面积图、折线图和柱状图中逐步添加数据点。

图表在小型 SVG 系列上方绘制标签、标题值和可选增量，点在可用时一次登陆一个。在运行时，该系列直接从工具调用的参数中流出。独立的你可以控制它有多少是可见的。

<demo react="assistant-ui/chart-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-chart"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-chart.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

图表的系列通常来自生成其标题值的同一工具调用，因此它通过该工具的 `render` 字段进行渲染。由于 `args` 是模型仍在编写的 JSON 的尽力解析，因此 `args.points` 保留了迄今为止流入的许多元素。将其长度直接传递为 `visibleCount`，图表会在到达时显示点。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Chart } from "@/components/assistant-ui/elements/chart";

type PlotMetricArgs = { label: string; points: number[] };
type PlotMetricResult = { value: string; delta?: string };

export const PlotMetricToolUI: ToolCallMessagePartComponent<
  PlotMetricArgs,
  PlotMetricResult
> = ({ args, result }) => {
  const points = args.points ?? [];
  return (
    <Chart
      label={args.label ?? ""}
      value={result?.value ?? "…"}
      delta={result?.delta}
      points={points}
      visibleCount={points.length}
      variant="area"
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { PlotMetricToolUI } from "@/components/assistant-ui/elements/plot-metric-tool-ui";

export const toolkit = defineToolkit({
  plot_metric: {
    type: "frontend",
    description: "将指标的最近历史记录绘制为小图表。",
    parameters: z.object({ label: z.string(), points: z.array(z.number()) }),
    execute: async ({ label, points }) => summarize(label, points),
    render: PlotMetricToolUI,
  },
});
```

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

   请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)，了解后端定义的工具和授权请求。

**独立版**

独立版中，`points` 是完整系列，`visibleCount` 是抽取多少。在计时器上增长 `visibleCount` 以重播流。

### 维护数据系列 {#hold-the-series}

```tsx
"use client";

import { useState } from "react";
import { Chart } from "@/components/assistant-ui/elements/chart";

const POINTS = [18, 22, 19, 31, 28, 42, 38, 51, 47, 63, 58, 71, 69, 84, 92];

export function RunsChart() {
  const [visibleCount, setVisibleCount] = useState(POINTS.length);
  return (
    <Chart
      label="本周运行"
      value="92"
      delta="+34%"
      points={POINTS}
      visibleCount={visibleCount}
      variant="area"
    />
  );
}
```

### 按时间间隔显示数据点 {#reveal-points-on-a-timer}

```tsx
useEffect(() => {
  if (visibleCount >= POINTS.length) return;
  const id = setTimeout(() => setVisibleCount((n) => n + 1), 180);
  return () => clearTimeout(id);
}, [visibleCount]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="chart">
  <div>{/* label, delta */}</div>
  <span>{/* value */}</span>
  <svg>{/* baseline, then an area+line, a line, or bars depending on variant */}</svg>
</div>
```

`visibleCount` 钳位到 `1…points.length`，因此图表始终绘制至少一个点并且永远不会超出数组。在 `line` 和 `area` 变体中，只有最后一个可见点才会得到填充点。在 `bars` 中，只有最后一个可见条被着色，其余条读为静音。 `delta` 的颜色取决于此举是否是好消息。它的方向来自 `trend`，或者，如果没有 1，则来自文本本身：数字全为零的 delta 读取为平，前导连字符、减号或破折号读取为向下，其他任何内容读取为向上。除非 `upIsGood` 是 `false`，否则上升呈绿色，下降呈红色，至于延迟或成本，这会翻转两者。`"flat"` 趋势保持中性。省略 `delta` 以完全隐藏它。

## 示例 {#examples}

### 选择变体 {#choosing-a-variant}

`variant` 决定系列如何绘制。不管怎样，标签、值和增量都保持在同一位置。

| 变体 | 抽奖 |
| ------------------ | ------------------------------------------------------- |
| `"area"`（默认） | 线条下方的填充渐变，加上线条本身。 |
| `"line"` | 仅有线条，无填充。 |
| `"bars"` | 每个可见点一个条，而不是一条线。 |

```tsx
<Chart variant="bars" /* ... */ />
```

### 设置指标变化方向 {#good-and-bad-directions}

对于越低越好的指标，请传递 `upIsGood={false}`，以便水滴显示为绿色。当增量文本不带符号时传递 `trend`，或者将其标记为平面：

```tsx
<Chart label="p50 latency" value="180ms" delta="-12ms" upIsGood={false} /* ... */ />
<Chart label="Errors" value="0" delta="no change" trend="flat" /* ... */ />
```

### 调整图表 {#restyle-the-chart}

两种用法都支持通过 `className` 调整根元素。标签和增量使用共享的 `mono` 标记，根使用 `paper`，两者都来自 `surfaces.tsx`。该系列本身是在 `chart.tsx` 中使用固定的蓝色填充和描边类绘制的，因此重新着色线条或条形意味着直接编辑该文件。

```tsx
<Chart className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### 图表 {#chart}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `label` | `string` |  | 值上方的标题。 |
| `value` | `string` |  | 标题编号，已格式化。 |
| `delta` | `string` |  | 可选的变化指示器，如图所示。 |
| `trend` | `"up" \| "down" \| "flat"` | 来自 `delta` | `delta` 移动的方向。如果没有它，全零增量读取为平坦，前导 `-`、`−` 或 `–` 读取为向下，其他任何值读取为向上。 |
| `upIsGood` | `boolean` | `true` | 上涨是否是好消息。 `false` 的颜色为秋季绿色和上升红色。 |
| `points` | `readonly number[]` |  | 全系列。 |
| `visibleCount` | `number` |  | 从`points`开始算多少分。钳位至 `1…points.length`。 |
| `variant` | `"area" \| "line" \| "bars"` | `"area"` | 系列如何绘制。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
