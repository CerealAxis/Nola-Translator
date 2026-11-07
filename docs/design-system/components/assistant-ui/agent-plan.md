---
title: Agent plan（代理计划）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Agent plan（代理计划）

显示代理的执行计划，区分已完成、进行中和等待执行的步骤。

<demo react="assistant-ui/agent-plan-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-agent-plan"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-agent-plan.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染工具调用

将工具参数中的 title、steps 和 `activeIndex` 传给 `AgentPlan`。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { AgentPlan } from "@/components/assistant-ui/elements/agent-plan";

export const toolkit = defineToolkit({
  update_plan: {
    type: "backend",
    render: ({ args }) => (
      <AgentPlan
        title={args.title}
        steps={args.steps}
        activeIndex={args.activeIndex}
      />
    ),
  },
});
```

### 注册工具包

把工具包注册到运行时的工具配置。消息列表会显示计划。

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { toolkit } from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存计划状态

在应用状态中保存步骤和 `activeIndex`，并把它们传给组件。

```tsx
"use client";

import { useState } from "react";
import { AgentPlan } from "@/components/assistant-ui/elements/agent-plan";

const STEPS = [
  { id: "read", label: "读取现有编辑器状态" },
  {
    id: "design",
    label: "设计草稿存储",
    description: "在准备完毕之前将待提交更改保留在本地。",
  },
  { id: "wire", label: "接入运行时持久化" },
  { id: "test", label: "添加回归测试" },
  { id: "docs", label: "更新文档" },
];

export function Plan() {
  const [activeIndex, setActiveIndex] = useState(0);
  return <AgentPlan title="编辑器草稿" steps={STEPS} activeIndex={activeIndex} />;
}
```

### 完成后推进步骤

每完成一步就推进 `activeIndex`。索引达到步骤数时显示全部完成。

```tsx
function completeStep() {
  setActiveIndex((i) => i + 1);
}
```

## 结构 {#anatomy}

计划由标题、总进度和按顺序排列的步骤组成。步骤既可传字符串，也可传包含标题和详情的对象。

```tsx
<div data-slot="agent-plan">
  <div>
    <span>{/* 标题 */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <div role="progressbar">{/* 显示进度 */}</div>
  <ul>
    <li>
      <span>{/* 显示加载状态 */}</span>
      <span>{/* 当前步骤信息 */}</span>
    </li>
  </ul>
</div>
```

`activeIndex` 之前的步骤显示为完成，当前索引显示为进行中，其余显示为等待。对象形式可提供稳定的 `id`。只有当前步骤显示详情。

## 示例 {#examples}

### 给当前步骤添加详情

使用 `AgentPlanStep` 对象提供说明，当前步骤展开显示详情。

```tsx
<AgentPlan
  title="发布清单"
  steps={[
    { id: "review", label: "审阅发行说明" },
    {
      id: "publish",
      label: "发布软件包",
      description: "等待发布任务结束。",
    },
    { id: "announce", label: "分享发行版本" },
  ]}
  activeIndex={1}
/>
```

### 重新开始计划

运行时通过新的工具调用给出新的步骤和索引。独立版将 `activeIndex` 重置为 0。

**使用运行时**

```tsx
render: ({ args }) => (
  <AgentPlan title={args.title} steps={args.steps} activeIndex={args.activeIndex} />
),
```

**独立使用**

```tsx
function restart() {
  setActiveIndex(0);
}
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 属性 | 类型 | 说明 |
| ------------------ | ----------------------------- | ------------------------------------------------- |
| `args.title` | `string \| undefined` | 标题。 |
| `args.steps` | `(string \| AgentPlanStep)[]` | 按执行或展示顺序排列的步骤。 |
| `args.activeIndex` | `number` | 当前活动项的索引。 |

**独立使用**

### AgentPlan

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | -------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `title` | `string` | `"Plan"` | 标题。 |
| `steps` | `readonly (string \| AgentPlanStep)[]` | 必填 | 按执行或展示顺序排列的步骤。 |
| `activeIndex` | `number` | 必填 | 当前正在执行的步骤索引。超出范围时限制到有效范围，NaN 按 0 处理。 |
| `className` | `string` |  | 合并到根元素的类名。 |

`AgentPlanStep` 的结构是 `{ id?: string; label: string; description?: string }`。传入 `id` 时用它作为该行的键。只有执行中的步骤显示 `description`。

其余 `div` 属性会转发给根元素。
