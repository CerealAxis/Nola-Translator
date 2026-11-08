---
title: Reasoning effort（推理强度）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Reasoning effort（推理强度）

选择推理强度，并显示当前任务消耗的推理预算。

<demo react="assistant-ui/reasoning-effort-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-reasoning-effort"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-reasoning-effort.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`reasoningEffort` 是 assistant-ui 模型上下文中的一个字段，[模型选择器](./model-selector) 也使用它来将工作量设置传递给模型。选择级别和读取其费用是分开的：第一个是注册，第二个是来自适配器的使用数据。

### 保存选中的推理强度 {#register-the-selected-effort}

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAui } from "@assistant-ui/react";
import { ReasoningEffort, type EffortLevel } from "@/components/assistant-ui/elements/reasoning-effort";

const LEVELS: readonly EffortLevel[] = [
  { key: "low", label: "低", budget: 2_000 },
  { key: "medium", label: "中", budget: 8_000 },
  { key: "high", label: "高", budget: 24_000 },
];

function useRegisteredEffort() {
  const [selectedKey, setSelectedKey] = useState("medium");
  const aui = useAui();

  useEffect(() => {
    return aui.modelContext.register({
      getModelContext: () => ({ config: { reasoningEffort: selectedKey } }),
    });
  }, [aui, selectedKey]);

  return { selectedKey, setSelectedKey };
}
```

   `budget` 没有运行时对应项：它描述你自己的工作量层，因此你的应用程序定义它。通过`modelContext`注册只影响下次运行。它不会追溯性地改变已经在飞行中的航班。

### 显示本次运行的消耗 {#show-what-the-run-spent}

```tsx
import { useThreadTokenUsage } from "@assistant-ui/ai-sdk";

function AssistantEffort() {
  const { selectedKey, setSelectedKey } = useRegisteredEffort();
  const usage = useThreadTokenUsage();

  return (
    <ReasoningEffort
      levels={LEVELS}
      selectedKey={selectedKey}
      spent={usage?.reasoningTokens ?? 0}
      onSelect={setSelectedKey}
    />
  );
}
```

   `useThreadTokenUsage` 由 `@assistant-ui/ai-sdk` 导出。使用不同的适配器，`reasoningTokens` 来自提供商的使用数据采用的任何形式。

**独立版**

Standalone、`levels`、`selectedKey` 和 `spent` 都是你拥有的普通值。该元素仅呈现它们并报告点击。

### 维护选中的强度 {#hold-the-selected-level}

```tsx
"use client";

import { useState } from "react";
import { ReasoningEffort, type EffortLevel } from "@/components/assistant-ui/elements/reasoning-effort";

const LEVELS: readonly EffortLevel[] = [
  { key: "low", label: "低", budget: 2_000 },
  { key: "high", label: "高", budget: 24_000 },
];

export function Effort() {
  const [selectedKey, setSelectedKey] = useState("low");
  return (
    <ReasoningEffort levels={LEVELS} selectedKey={selectedKey} spent={0} onSelect={setSelectedKey} />
  );
}
```

### 自行记录消耗 {#track-spend-yourself}

```tsx
const [spent, setSpent] = useState(0);
// bump `spent` from whatever event marks progress in your own flow
```

## 结构 {#anatomy}

```tsx
<div data-slot="reasoning-effort">
  <div>{/* "Thinking" label + "spent / budget" */}</div>
  <div>{/* one button per level, aria-pressed on the active one */}</div>
  <span role="progressbar">{/* progress track, width = spent / budget as a percentage */}</span>
</div>
```

关卡按给定顺序渲染。没有重新排序或分组。如果 `selectedKey` 与任何 `level.key` 都不匹配，则预算解析为 0，并且进度填充保持折叠在 0%，而不是出错。填充的宽度为 `spent`，作为匹配级别的 `budget` 的一部分，限制在 0% 和 100% 之间，因此过大的 `spent` 值不会溢出条形。轨道是一个命名的进度条，而不是米，因为花费的预算在跑步过程中不断攀升，而不是停留在读数上。它的 `0…100` 值与该宽度匹配，并且其值文本读取与标头打印的 `budget` 相同的 `spent`。

## 示例 {#examples}

### 读取模型的推理强度字段 {#reading-the-models-own-effort-field}

输入框的模型选择器（`/elements/model-selector`）通过自己的努力控制写入相同的`config.reasoningEffort`字段。同时安装两者会为同一字段注册两个提供程序，因此仅将其中一个连接到给定应用程序中的模型上下文。assistant-ui 按优先级合并注册的模型上下文，而不是按哪个组件发生渲染。

### 调整控件 {#restyle-the-control}

两种用法都支持通过 `className` 调整根元素，以 `flex w-full max-w-sm flex-col gap-2.5` 开头。分段控件的轨道使用共享的 `field` 表面，计数使用 `mono` 标记，两者都来自 `surfaces.tsx`。

```tsx
<ReasoningEffort className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 模型上下文与用量 {#model-context-and-usage}

| 选择器/调用 | 类型 | 说明 |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `aui.modelContext.register(provider)` | `(provider: ModelContextProvider) => Unsubscribe` | 注册`config.reasoningEffort`以供下次运行。返回的函数取消注册它。 |
| `useThreadTokenUsage()` (`@assistant-ui/ai-sdk`) | `ThreadTokenUsage \| undefined` | `reasoningTokens` 是用于推理带有使用数据的最新消息的代币。 |

**独立版**

### ReasoningEffort {#reasoningeffort}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `levels` | `readonly EffortLevel[]` |  | `{ key: string; label: string; budget: number }[]`，按顺序渲染。 |
| `selectedKey` | `string` |  | 有效电平的`key`。不匹配的密钥会将预算解析为 0。 |
| `spent` | `number` |  | 进度填充值，根据所选级别的 `budget` 读取。 |
| `onSelect` | `(key: string) => void` |  | 当按下关卡的按钮时，使用关卡的 `key` 进行调用。如果没有它，工作量级别就会呈现为非交互式标签。 |
| `className` | `string` |  | 合并到根元素。 |

除 `children`、`levels`、`selectedKey`、`spent` 和 `onSelect` 之外的所有其他 `div` props 都转发到根。
