---
title: Comparison（比较）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Comparison（比较）

并排比较选项和各项特征，标出推荐方案，并说明推荐理由。

<demo react="assistant-ui/comparison-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-comparison-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-comparison-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 注册渲染函数

通过 compare_options 工具传入最终的比较参数。流式生成期间先返回 null，等 `status.type` 为 "complete" 再渲染。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { ComparisonCard } from "@/components/assistant-ui/elements/comparison-card";

export const toolkit = defineToolkit({
  compare_options: {
    type: "backend",
    render: ({ args, status }) => {
      if (status.type !== "complete") return null;
      return <ComparisonCard {...args} />;
    },
  },
});
```

参阅 [延迟渲染](https://www.assistant-ui.com/docs/tools/tool-ui#deferred-rendering) 了解这一模式。

### 由消息列表渲染

在 `AssistantRuntimeProvider` 下注册工具包。Thread 或基于 `MessagePrimitive.Parts` / `GroupedParts` 的消息列表会在对应工具调用位置显示卡片。

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

### 直接传入选项

直接传入 `traitLabels`、options、`recommendedId` 和 reason。特征的值与 `traitLabels` 按索引配对。

```tsx
"use client";

import {
  ComparisonCard,
  type ComparisonOption,
} from "@/components/assistant-ui/elements/comparison-card";

const traitLabels = ["流式输出", "多会话", "自托管"] as const;

const options: readonly ComparisonOption[] = [
  {
    id: "local",
    name: "本地运行时",
    headline: "自行管理执行流程",
    traits: ["支持流式输出", "多会话", "自托管"],
  },
  {
    id: "external",
    name: "外部状态存储",
    headline: "以应用状态为准",
    traits: ["支持流式输出", "多会话", false],
  },
];

export function RuntimeChoice() {
  return (
    <ComparisonCard
      traitLabels={traitLabels}
      options={options}
      recommendedId="local"
      reason="消息已保存在应用状态中，由本地运行时处理流式输出和分支，接入工作更少。"
    />
  );
}
```

### 切换推荐项

重新计算 `recommendedId` 和 reason 即可切换推荐项。组件不会保留上一次选择。

```tsx
export function RuntimeChoice({ selfHostedOnly }: { selfHostedOnly: boolean }) {
  const recommendedId = selfHostedOnly ? "local" : "external";
  const reason = selfHostedOnly
    ? "本地运行时将数据保留在自有基础设施内，符合自托管要求。"
    : "如果消息状态已由现有服务负责，外部存储更合适。";

  return (
    <ComparisonCard
      traitLabels={traitLabels}
      options={options}
      recommendedId={recommendedId}
      reason={reason}
    />
  );
}
```

## 结构 {#anatomy}

按数组顺序显示选项，每项都与共享特征列表对齐。所有内容立即显示。只有 id 与 `recommendedId` 相同的选项会高亮。

```tsx
<div data-slot="comparison-card">
  <div>
    {/* 逐项渲染 */}
    <div>
      <span>{/* option.name */}{/* 显示名称或标题 */}</span>
      <span>{/* option.headline */}</span>
      <div>
        {/* 逐项渲染 */}
        <span>{/* 图标 */}</span>
        <span>{/* 显示名称或标题 */}</span>
      </div>
    </div>
  </div>

  <p>{/* 原因 */}</p>
</div>
```

组件不接收 `visibleCount`。如果没有任何选项匹配 `recommendedId`，则所有选项都保持常规样式，不显示推荐标记。特征值为空时，使用对应的共享标签和减号。

## 示例 {#examples}

### 缺少的特征

使用 false、空字符串或缺失的数组项。对应行仍会显示共享特征名称，并使用减号标记。

```tsx
const options: readonly ComparisonOption[] = [
  { id: "a", name: "方案甲", headline: "包含全部功能", traits: ["支持流式输出", "多会话", "自托管"] },
  { id: "b", name: "方案乙", headline: "占用资源更少", traits: ["支持流式输出", false] },
];
```

### 比较数据来源

运行时可以让模型比较选项，后端执行器原样返回参数。独立版可同时从已有数据生成选项和推荐项，确保 ID 对得上。

**使用运行时**

```tsx
compare_options: tool({
  description: "比较两个方案并指出推荐选项。",
  inputSchema: z.object({
    traitLabels: z.array(z.string()),
    options: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        headline: z.string(),
        traits: z.array(z.union([z.string(), z.literal(false)])),
      }),
    ),
    recommendedId: z.string(),
    reason: z.string(),
  }),
  execute: async (args) => args,
}),
```

**独立使用**

```tsx
const options = plans.map((plan) => ({
  id: plan.id,
  name: plan.name,
  headline: plan.headline,
  traits: traitLabels.map((label) => plan.traits[label] ?? false),
}));
const recommendedId = pickBestPlan(plans).id;
```

### 调整卡片样式

在根元素上传入 `className`。

```tsx
<ComparisonCard className="max-w-lg gap-4" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 属性 | 类型 | 说明 |
| -------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args` | `{ traitLabels: string[]; options: ComparisonOption[]; recommendedId: string; reason: string }` | 比较工具的参数。status.type 为 running 时可能只解析了一部分。 |
| `status` | `ToolCallMessagePartStatus` | running 时参数还在生成，complete 时才挂载完整比较卡片。 |

### compare_options 参数

| 字段 | 类型 | 说明 |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `traitLabels` | `string[]` | 各选项共享的特征名称，按列顺序排列。 |
| `options[].id` | `string` | 条目的稳定标识。 |
| `options[].name` | `string` | 要显示的名称。 |
| `options[].headline` | `string` | 名称下方的一行说明。 |
| `options[].traits` | `(string \| false)[]` | 与 traitLabels 按索引配对。false 或缺失表示不具备该特征。 |
| `recommendedId` | `string` | 要标记为推荐方案的选项 ID。 |
| `reason` | `string` | 原因或补充说明。 |

**独立使用**

### ComparisonCard

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ----------------------------- | -------- | -------------------------------------------------------- |
| `traitLabels` | `readonly string[]` | 必填 | 各选项共享的特征名称，按列顺序排列。 |
| `options` | `readonly ComparisonOption[]` | 必填 | 按展示顺序提供的选项。 |
| `recommendedId` | `string` | 必填 | 要标记为推荐方案的选项 ID。 |
| `reason` | `string` | 必填 | 原因或补充说明。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### ComparisonOption

| 字段 | 类型 | 说明 |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `name` | `string` | 要显示的名称。 |
| `headline` | `string` | 名称下方的一行说明。 |
| `traits` | `readonly (string \| false)[]` | 与 traitLabels 按索引配对。false 或缺失表示不具备该特征。 |
