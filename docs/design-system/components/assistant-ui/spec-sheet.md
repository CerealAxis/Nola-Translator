---
title: Spec sheet（规格表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Spec sheet（规格表）

以标签和值的形式展示单个对象的结构化规格。

单个标记对象的结构化形状，大多数工具结果在表格之后即可达到的答案：标题、可选副标题以及一次显示一个的一列标签和值行。对于运行时，行来自工具结果。独立的你可以直接传递它们。

<demo react="assistant-ui/spec-sheet-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-spec-sheet"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-spec-sheet.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

该元素没有自己的 assistant-ui 基础组件，因此运行时连接是工具渲染器而不是基础组件组合。与模型自由创作的作品不同，规格表通常是查找，因此行属于工具的 `result`，而不是其流式传输的 `args`。

### 注册渲染函数 {#register-the-render-function}

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { SpecSheet } from "@/components/assistant-ui/elements/spec-sheet";

export const toolkit = defineToolkit({
  get_model_card: {
    type: "backend",
    render: ({ args, result }) => {
      if (!result) return <p>抬头 {args.modelId}…</p>;
      return (
        <SpecSheet
          title={result.title}
          subtitle={result.subtitle}
          rows={result.rows}
          visibleCount={result.rows.length}
        />
      );
    },
  },
});
```

   由于整个工作表作为一个结果而不是作为流步骤落地，因此 `visibleCount` 是 `result.rows.length`。没有任何局部状态可以用来衡量它。

### 交给消息列表渲染 {#let-the-message-list-render-it}

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

   工具包注册后，`Thread` 和任何基于 assistant-ui 消息部分基元（`MessagePrimitive.Parts` 或 `MessagePrimitive.GroupedParts`）构建的自定义消息列表都会在消息中出现 `get_model_card` 调用的地方自动呈现注册的 UI，因此无需手动放置任何内容。

**独立版**

独立的元素是一个普通的显示组件：它不拥有自己的状态，因此最小的用法是一次显示一组恒定的行。

### 直接传入数据行 {#pass-the-rows-straight-through}

```tsx
"use client";

import {
  SpecSheet,
  type SpecRow,
} from "@/components/assistant-ui/elements/spec-sheet";

const rows: readonly SpecRow[] = [
  { label: "上下文", value: "1,000,000 tokens" },
  { label: "输入", value: "$4.00 / M" },
  { label: "最适合", value: "Long agentic runs", emphasis: true },
];

export function ModelCard() {
  return (
    <SpecSheet
      title="作品 5.5"
      subtitle="克劳德-opus-5-5"
      rows={rows}
      visibleCount={rows.length}
    />
  );
}
```

### 控制数据行的显示时机 {#reveal-rows-on-your-own-schedule}

```tsx
"use client";

import { useEffect, useState } from "react";

export function ModelCard() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= rows.length) return;
    const id = setTimeout(() => setVisibleCount((n) => n + 1), 260);
    return () => clearTimeout(id);
  }, [visibleCount]);

  return (
    <SpecSheet
      title="作品 5.5"
      subtitle="克劳德-opus-5-5"
      rows={rows}
      visibleCount={visibleCount}
    />
  );
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="spec-sheet">
  <div>
    <span>{/* title */}</span>
    <span>{/* optional subtitle */}</span>
  </div>

  <div>
    {/* one row per visible row, first row has no top border */}
    <span>{/* row.label, monospace */}</span>
    <span>{/* row.value, right aligned; emphasis bolds and brightens it */}</span>
  </div>
</div>
```

`title` 和 `subtitle` 始终渲染，无论 `visibleCount` 为何。仅对行列表进行切片。 `visibleCount` 被下限并钳位到 `0…rows.length` 中，就像 `visibleSteps` 在数学元素上一样：NaN 或负数映射到 0，超过数组长度的任何值都映射到数组长度。行由 `row.label` 进行键控，因此共享一个标签的两行在 React 的协调中会发生冲突。使标签在一张纸中保持唯一。第一行没有上边框。后面的每一行都会这样做。

## 示例 {#examples}

### 标记影响选择的行 {#marking-the-deciding-row}

`emphasis` 是行中唯一的视觉变化：将其设置在应该被视为答案而不是支持事实的行上，并且它的值比其他值呈现得更大胆、更明亮。

```tsx
const rows: readonly SpecRow[] = [
  { label: "输入", value: "$15.00 / M" },
  { label: "输出", value: "$75.00 / M" },
  { label: "最适合", value: "Long agentic runs", emphasis: true },
];
```

### 行从哪里来 {#where-the-rows-come-from}

**运行时版**

后端条目仅声明查找键。模型提供 `modelId`，你的服务器解决其余部分，客户端渲染器除了完成的形状之外永远看不到任何内容。

```ts
get_model_card: tool({
  description: "Look up pricing and capability details for a model.",
  inputSchema: z.object({ modelId: z.string() }),
  execute: async ({ modelId }) => getModelCard(modelId),
}),
```

**独立版**

当行来自你自己的请求而不是固定常量时，获取它们一次并重置显示计数，以便动画从头开始播放。

```tsx
async function loadModelCard(modelId: string) {
  const card = await fetchModelCard(modelId);
  setRows(card.rows);
  setVisibleCount(0);
}
```

### 调整规格表样式 {#restyle-the-sheet}

两种用法都支持通过 `className` 调整根元素。行标签使用 `surfaces.tsx` 中的共享 `mono` 表面，因此调整该标记会调整使用它的每个元素。

```tsx
<SpecSheet className="max-w-none gap-4" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 渲染属性 {#render-props}

| 属性 | 类型 | 说明 |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `args` | `{ modelId: string }` | 工具的参数，模型提供的查找键。 |
| `result` | `{ title: string; subtitle?: string; rows: SpecRow[] } \| undefined` | 完成的规范，在后端执行器解析之前未定义。 |

### 获取模型卡结果 {#getmodelcard-result}

| 字段 | 类型 | 说明 |
| ----------------- | --------- | ---------------------------------------------------------------- |
| `title` | `string` | 工作表的标题。 |
| `subtitle` | `string` | 标题下的可选标题。 |
| `rows[].label` | `string` | 行标签，以等宽字体显示。结果中必须是唯一的。 |
| `rows[].value` | `string` | 行值，右对齐。 |
| `rows[].emphasis` | `boolean` | 当为真时，将值加粗并加亮。 |

**独立版**

### SpecSheet {#specsheet}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | -------------------- | -------- | ---------------------------------------------------------------- |
| `title` | `string` |  | 工作表的标题。 |
| `subtitle` | `string` |  | 标题下的可选标题。 |
| `rows` | `readonly SpecRow[]` |  | 完整的行列表，仅渲染第一个 `visibleCount`。 |
| `visibleCount` | `number` |  | 要显示多少行、地板并夹入 `0…rows.length`。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。

### SpecRow {#specrow}

| 字段 | 类型 | 说明 |
| ---------- | --------- | --------------------------------------------------------------------- |
| `label` | `string` | 行标签，以等宽字体显示。用作 React 键，保持其唯一性。 |
| `value` | `string` | 行值，右对齐。 |
| `emphasis` | `boolean` | 可选，当值为真时将值加粗并加亮。 |
