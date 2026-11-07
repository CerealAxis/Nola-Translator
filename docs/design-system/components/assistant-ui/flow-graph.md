---
title: Flow graph（流程图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Flow graph（流程图）

用节点和分支展示流程中的并行工作与汇合。

流程图将工作绘制为小型依赖图而不是平面列表：节点位于列中，弯曲的边缘连接相互依赖的节点。使用运行时，你可以在模型写入工具调用的参数时将其布置出来。在独立版中，你自己保存节点和边缘数组。

<demo react="assistant-ui/flow-graph-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-flow-graph"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-flow-graph.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

对于运行时，流程图通常是一个工具调用，其参数描述了整个计划：一系列步骤，每个步骤都命名了它所依赖的内容。一个小的布局函数将该列表转换为 `FlowGraph` 期望的列、行和边。

### 用工具调用数据布局计划 {#lay-out-the-plan-from-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  FlowGraph,
  type FlowEdge,
  type FlowNode,
} from "@/components/assistant-ui/elements/flow-graph";

type PlanStep = { id: string; label: string; dependsOn?: string[] };
type PlanArgs = { steps: PlanStep[] };

function layout(steps: PlanStep[], done: boolean) {
  const columnOf = new Map<string, number>();
  const rowsUsed = new Map<number, number>();
  const nodes: FlowNode[] = steps.map((step, index) => {
    const deps = step.dependsOn ?? [];
    const column = deps.length
      ? Math.max(...deps.map((id) => columnOf.get(id) ?? 0)) + 1
      : 0;
    columnOf.set(step.id, column);
    const row = rowsUsed.get(column) ?? 0;
    rowsUsed.set(column, row + 1);
    const state = done || index < steps.length - 1 ? "done" : "active";
    return { id: step.id, label: step.label, column, row, state };
  });
  const edges: FlowEdge[] = steps.flatMap((step) =>
    (step.dependsOn ?? []).map((from) => ({ from, to: step.id })),
  );
  return { nodes, edges };
}

export const PlanGraphToolUI: ToolCallMessagePartComponent<
  PlanArgs,
  unknown
> = ({ args, status }) => {
  const steps = args.steps ?? [];
  if (steps.length === 0) return null;
  const { nodes, edges } = layout(steps, status.type === "complete");
  return <FlowGraph nodes={nodes} edges={edges} visibleCount={nodes.length} />;
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { PlanGraphToolUI } from "@/components/assistant-ui/elements/plan-graph-tool-ui";

const step = z.object({
  id: z.string(),
  label: z.string(),
  dependsOn: z.array(z.string()).optional(),
});

export const toolkit = defineToolkit({
  propose_plan: {
    type: "frontend",
    description: "为未来的工作提出一个按依赖性排序的计划。",
    parameters: z.object({ steps: z.array(step) }),
    execute: async ({ steps }) => runPlan(steps),
    render: PlanGraphToolUI,
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

在独立版中，你已经持有 `nodes` 和 `edges` 并决定了它们的布局。`visibleCount` 是随时间变化的一件事。

### 维护流程图 {#hold-the-graph}

```tsx
"use client";

import { useState } from "react";
import {
  FlowGraph,
  type FlowEdge,
  type FlowNode,
} from "@/components/assistant-ui/elements/flow-graph";

const NODES: readonly FlowNode[] = [
  { id: "intake", label: "进气", column: 0, row: 1, state: "done" },
  { id: "plan", label: "计划", column: 1, row: 1, state: "done" },
  { id: "search", label: "搜索", column: 2, row: 0, state: "done" },
  { id: "patch", label: "补丁", column: 2, row: 2, state: "active" },
  { id: "verify", label: "验证", column: 3, row: 1, state: "pending" },
];

const EDGES: readonly FlowEdge[] = [
  { from: "intake", to: "plan" },
  { from: "plan", to: "search" },
  { from: "plan", to: "patch" },
  { from: "search", to: "verify" },
  { from: "patch", to: "verify" },
];

export function Plan() {
  const [visibleCount, setVisibleCount] = useState(NODES.length);
  return <FlowGraph nodes={NODES} edges={EDGES} visibleCount={visibleCount} />;
}
```

### 随任务进度显示节点 {#reveal-nodes-as-work-happens}

```tsx
useEffect(() => {
  if (visibleCount >= NODES.length) return;
  const id = setTimeout(() => setVisibleCount((n) => n + 1), 520);
  return () => clearTimeout(id);
}, [visibleCount]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="flow-graph">
  <svg>{/* one curved path per edge */}</svg>
  <div>{/* one absolutely positioned node per visible node, fading and scaling in */}</div>
</div>
```

`visibleCount` 从数组开头对 `nodes` 进行切片。仅当 `from` 和 `to` id 都位于该切片内时，边缘才会以明亮的笔划绘制，否则读取为微弱的笔划。命名不在 `nodes` 中的 id 的边将被完全跳过。 `state` 驱动每个节点的边框和填充：`"done"` 是一个静音填充框，`"active"` 是蓝色轮廓，`"pending"` 是一个未填充框，带有主题的 `border` 颜色的虚线边框。

## 示例 {#examples}

### 定位节点 {#positioning-nodes}

`column`和`row`是你选择的网格坐标，不是从`edges`导出的。两个节点可以共享一列，并且该图不会尝试避免重叠。

```tsx
{ id: "search", label: "search", column: 2, row: 0, state: "done" },
{ id: "patch", label: "patch", column: 2, row: 2, state: "active" },
```

### 调整图形 {#restyle-the-graph}

两种用法都支持通过 `className` 调整根元素。节点标签读取共享的 `mono` 标记，根读取 `paper`，两者都来自 `surfaces.tsx`。

```tsx
<FlowGraph className="max-w-none" /* ... */ />
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

没有专用的计划到图形基础组件：上面的 `layout` 是您编写的普通函数，将您的工具参数采用的任何形状转换为 `FlowGraph` 期望的 `FlowNode[]` 和 `FlowEdge[]` 。在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。有关完整的渲染属性列表，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### FlowGraph {#flowgraph}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | --------------------- | -------- | ------------------------------------------------------ |
| `nodes` | `readonly FlowNode[]` |  | 图中的每个节点，都有自己的布局位置。 |
| `edges` | `readonly FlowEdge[]` |  | 节点 ID 之间的连接。 |
| `visibleCount` | `number` |  | 从`nodes`开始显示多少个节点。 |
| `className` | `string` |  | 合并到根元素。 |

`FlowNode` 是 `{ id: string; label: string; column: number; row: number; state: "done" | "active" | "pending" }`。 `FlowEdge` 是 `{ from: string; to: string }`，引用节点 id。其余 `div` 属性会传给根元素。
