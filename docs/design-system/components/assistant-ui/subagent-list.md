---
title: Subagent list（子代理列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Subagent list（子代理列表）

汇总并行子代理，显示各自的进度与最终汇总代理。

<demo react="assistant-ui/subagent-list-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-subagent-list"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-subagent-list.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 隐藏派发调用

注册 dispatch_subagent 和 summarize_findings 工具。这些工具的默认渲染可以返回 null。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";

export const toolkit = defineToolkit({
  dispatch_subagent: { type: "backend", render: () => null },
  summarize_findings: { type: "backend", render: () => null },
});
```

### 在消息下汇总

在消息渲染器中汇总调用，生成子代理列表。dispatch_subagent 的完成状态决定计数，summarize_findings 的存在决定是否显示汇总行。

```tsx
import { MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { SubagentList } from "@/components/assistant-ui/elements/subagent-list";

function SubagentProgress() {
  const parts = useAuiState((s) => s.message.parts);
  const calls = parts.filter(
    (p) => p.type === "tool-call" && p.toolName === "dispatch_subagent",
  );
  const summaryCall = parts.find(
    (p) => p.type === "tool-call" && p.toolName === "summarize_findings",
  );
  if (calls.length === 0) return null;

  return (
    <SubagentList
      agents={calls.map((c) => ({ name: c.args.name, model: c.args.model }))}
      completedCount={calls.filter((c) => c.status.type === "complete").length}
      progress={calls.map((c) => (c.status.type === "complete" ? 100 : 0))}
      showSummary={summaryCall !== undefined}
      summaryAgent={
        summaryCall
          ? { name: summaryCall.args.name, model: summaryCall.args.model }
          : { name: "", model: "" }
      }
    />
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts />
      <SubagentProgress />
    </MessagePrimitive.Root>
  );
}
```

**独立使用**

### 保存子代理名单和进度

调用方持有 agents、progress、`completedCount` 以及 `summaryAgent`。

```tsx
"use client";

import { useState } from "react";
import {
  SubagentList,
  type SubagentItem,
} from "@/components/assistant-ui/elements/subagent-list";

const AGENTS: readonly SubagentItem[] = [
  { name: "查阅运行时", model: "haiku" },
  { name: "修复编辑器类型", model: "sonnet" },
  { name: "编写回归测试", model: "sonnet" },
];

export function Agents() {
  const [completedCount, setCompletedCount] = useState(0);
  const [progress, setProgress] = useState([0, 0, 0]);

  return (
    <SubagentList
      agents={AGENTS}
      completedCount={completedCount}
      progress={progress}
      showSummary={false}
      summaryAgent={{ name: "汇总结论", model: "haiku" }}
    />
  );
}
```

### 更新进度和完成状态

保持 progress 和 agents 按索引对齐。更新 `completedCount` 表示列表前方已完成的数量。

```tsx
function onWorkerProgress(index: number, percent: number) {
  setProgress((prev) => prev.with(index, percent));
}

function onWorkerDone() {
  setCompletedCount((count) => count + 1);
}
```

## 结构 {#anatomy}

卡片从上到下显示子代理名称、模型和每项进度，末尾可追加汇总代理。

```tsx
<div data-slot="subagent-list">
  <div>
    <span>{/* 显示加载状态 */}</span>
    <span>{/* 显示名称或标题 */}</span>
    <span>{/* 对应槽位内容 */}</span>
    <span role="progressbar">{/* 显示进度 */}</span>
  </div>
  {/* 逐项渲染 */}
</div>
```

每个进度条以对应代理的名称提供可访问标签。汇总项出现时显示加载状态，由于没有可确定的进度，不向辅助技术播报百分比。

## 示例 {#examples}

### 调整列表样式

通过 `className` 为根元素指定布局。

```tsx
<SubagentList className="max-w-sm gap-3" /* ... */ />
```

### 进度来源

运行时把已完成的派发映射为 100，其余映射为 0。独立版可用应用上报的百分比。

**独立使用**

```tsx
async function runWorker(index: number) {
  for (let pct = 0; pct <= 100; pct += 20) {
    await tick();
    setProgress((prev) => prev.with(index, pct));
  }
  setCompletedCount((count) => count + 1);
}
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 来源 | 类型 | 说明 |
| --------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `dispatch_subagent` call `args.name` / `args.model` | `string` | `dispatch_subagent call args.name` 当前模型。 |
| `dispatch_subagent` call `status.type` | `"running" \| "requires-action" \| "incomplete" \| "complete"` | 状态为 complete 时计入已完成，进度为 100，其余情况按 0 处理。 |
| `summarize_findings` call | 工具调用或 undefined | 存在调用时显示汇总项，并将参数用作 summaryAgent。 |

**独立使用**

### SubagentList

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents` | `readonly SubagentItem[]` | 必填 | 按展示顺序排列的子代理。 |
| `completedCount` | `number` | 必填 | 从列表开头数起的已完成子代理数。 |
| `progress` | `readonly number[]` | 必填 | 与 agents 按索引对齐的百分比，限制在 0 至 100。缺失或 NaN 按 0 处理。 |
| `showSummary` | `boolean` | 必填 | 控制是否显示汇总代理。 |
| `summaryAgent` | `SubagentItem` | 必填 | 汇总代理的名称和模型。 |
| `className` | `string` |  | 合并到根元素的类名。 |

`SubagentItem` 的结构是 `{ name: string; model: string }`。
