---
title: Activity graph（活动图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Activity graph（活动图）

用日历热力图展示近半年的任务活动。

活动图使用 `heat-graph` 绘制日历网格，以五级色阶表示每天的运行次数。标题和总次数显示在网格上方。运行时版从工具结果读取每日计数，独立版直接接收相同的数据。

<demo react="assistant-ui/activity-graph-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-activity-graph"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-activity-graph.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

在运行时，`data` 正是工具返回的形状：在某个窗口内每天计数一次。注册一个报告它的工具，图表不需要其他任何东西。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { DataPoint } from "heat-graph";
import { ActivityGraph } from "@/components/assistant-ui/elements/activity-graph";

type ActivityArgs = { days: number };
type ActivityResult = {
  title: string;
  total: string;
  start: string;
  end: string;
  data: DataPoint[];
};

export const RunActivityToolUI: ToolCallMessagePartComponent<
  ActivityArgs,
  ActivityResult
> = ({ result }) => {
  if (!result) return null;
  return (
    <ActivityGraph
      data={result.data}
      start={result.start}
      end={result.end}
      title={result.title}
      total={result.total}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { RunActivityToolUI } from "@/components/assistant-ui/elements/run-activity-tool-ui";

export const toolkit = defineToolkit({
  get_run_activity: {
    type: "frontend",
    description: "获取过去 N 天的每日运行计数作为热图。",
    parameters: z.object({ days: z.number() }),
    execute: async ({ days }) => fetchRunActivity(days),
    render: RunActivityToolUI,
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

独立，自己持有相同的`data`、`start`、`end`。该元素负责网格布局、着色和图例。

### 保持数据 {#hold-the-data}

```tsx
"use client";

import type { DataPoint } from "heat-graph";
import { ActivityGraph } from "@/components/assistant-ui/elements/activity-graph";

const START = new Date(2026, 1, 2);
const DAYS = 182;
const dayAfterStart = (offset: number) =>
  new Date(START.getFullYear(), START.getMonth(), START.getDate() + offset);
const END = dayAfterStart(DAYS - 1);

const DATA: readonly DataPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  date: dayAfterStart(i),
  count: Math.round(Math.random() * 12),
}));

const TOTAL = DATA.reduce((sum, point) => sum + point.count, 0);

export function AgentActivity() {
  return (
    <ActivityGraph
      data={DATA}
      start={START}
      end={END}
      title="代理运行"
      total={`${TOTAL.toLocaleString("en-US")} in 6 months`}
    />
  );
}
```

### 更新日期范围 {#refresh-the-window}

   元素内部没有实时更新：每当窗口发生变化时，移动 `start` 和 `end` 并传递一个新计算的 `data` 数组。

```tsx
const [days, setDays] = useState(182);
const start = daysAgo(days);
const end = new Date();
const data = useRunHistory(start, end);
```

## 结构 {#anatomy}

```tsx
<div data-slot="activity-graph">
  <div>{/* title, total */}</div>
  {/* HeatGraph.Root: day labels down the left, a grid of cells, a less-to-more legend */}
</div>
```

每个单元格的颜色取决于 `heat-graph` 为 `DataPoint` 分配的 `level`。级别 0 到 4 分别对应五种深浅的蓝色，超出范围时使用最浅的颜色。左侧只标注周二、周四和周六，避免标签拥挤。每周固定从周一开始。

## 示例 {#examples}

### 选择日期范围 {#choosing-the-date-range}

`start`和`end`绑定网格。`heat-graph` 填充 `data` 之间的每一天，包括没有匹配点的日子，这些日子以最低色调渲染。

```tsx
<ActivityGraph data={data} start={sixMonthsAgo} end={today} title="代理运行" total={total} />
```

### 调整图形 {#restyle-the-graph}

两种用法都支持通过 `className` 调整根元素。标题读取纯文本，总计从 `surfaces.tsx` 读取共享的 `mono` 标记。色调比例本身是 `activity-graph.tsx` 内的固定数组，因此对单元格重新着色意味着直接编辑该文件。

```tsx
<ActivityGraph className="max-w-none" /* ... */ />
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

### ActivityGraph {#activitygraph}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------------------- | -------- | ---------------------------------------------------------- |
| `data` | `readonly DataPoint[]` |  | 每天计数一次。 |
| `start` | `string \| Date` |  | 绘制窗口的开始。 |
| `end` | `string \| Date` |  | 绘制窗口结束。 |
| `title` | `string` |  | 航向高于网格。 |
| `total` | `string` |  | 摘要文本，已格式化，显示在标题对面。 |
| `className` | `string` |  | 合并到根元素。 |

`DataPoint`，来自`heat-graph`包，是`{ date: string | Date; count: number }`。其余 `div` 属性会传给根元素。

6个月内
