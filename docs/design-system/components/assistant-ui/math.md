---
title: Math（数学公式）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Math（数学公式）

渲染数学表达式，并逐步呈现推导过程。

一个答案显示为其工作而不是最终结果：一个简短的步骤列表，每个步骤都有一个表达式，下面有一个可选注释，仅按照你所说的内容显示。对于运行时，这些步骤是在模型流式传输时从工具调用到达的。在独立版中，你可以自己保存步骤数组并显示计数。

<demo react="assistant-ui/math-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-math-block"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-math-block.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

该元素没有自己的assistant-ui基础组件：派生正是工具调用携带的那种结构化内容，因此运行时连接是工具渲染器而不是基础组件组合。

### 注册渲染函数 {#register-the-render-function}

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { MathBlock } from "@/components/assistant-ui/elements/math-block";

export const toolkit = defineToolkit({
  show_derivation: {
    type: "backend",
    render: ({ args }) => {
      const steps = args.steps ?? [];
      return (
        <MathBlock
          label={args.label}
          steps={steps}
          visibleSteps={steps.length}
        />
      );
    },
  },
});
```

   `show_derivation` 除了返回自己的参数之外没有任何需要执行的内容：推导正是模型流式传输的内容，因此渲染器在每个状态下读取 `args`，并且无需设计单独的结果形状，并且匹配的服务器条目可以与 `execute: async (args) => args` 一样小。请参阅[定义工具](https://www.assistant-ui.com/docs/tools/defining-tools)，了解工具架构、执行器和渲染器之间的完整划分。

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

   工具包注册后，`Thread` 和任何基于 assistant-ui 的消息部分基础组件（`MessagePrimitive.Parts` 或 `MessagePrimitive.GroupedParts`）构建的自定义消息列表都会在消息中出现 `show_derivation` 调用的任何地方自动呈现注册的 UI，因此无需手动放置任何内容。

**独立版**

独立的元素是一个普通的显示组件：它没有自己的状态，因此最小的用法是一次显示所有的常量数组。

### 直接传入步骤 {#pass-the-steps-straight-through}

```tsx
"use client";

import {
  MathBlock,
  type MathStep,
} from "@/components/assistant-ui/elements/math-block";

const steps: readonly MathStep[] = [
  { expression: "p′(x) = p(x)·(1 − p(x))", note: "the derivative" },
  {
    expression: "max p′(x) = 0.25 at x = 0",
    note: "steepest at the midpoint",
  },
];

export function Derivation() {
  return (
    <MathBlock label="推导" steps={steps} visibleSteps={steps.length} />
  );
}
```

### 控制步骤的显示时机 {#reveal-steps-on-your-own-schedule}

```tsx
"use client";

import { useEffect, useState } from "react";

export function Derivation() {
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    if (visibleSteps >= steps.length) return;
    const id = setTimeout(() => setVisibleSteps((n) => n + 1), 900);
    return () => clearTimeout(id);
  }, [visibleSteps]);

  return (
    <MathBlock label="推导" steps={steps} visibleSteps={visibleSteps} />
  );
}
```

   每个增量都会重新渲染，视图中又多了一个步骤，并且只有新显示的步骤才会动画显示，因为较早的步骤已经安装在同一数组索引处。

## 结构 {#anatomy}

```tsx
<div data-slot="math-block">
  {/* optional label, monospace */}
  <span>{/* label */}</span>

  {/* one row per visible step, in array order */}
  <div>
    <span>{/* step.expression, a ReactNode */}</span>
    <span>{/* optional step.note */}</span>
  </div>
</div>
```

`visibleSteps` 被取整并钳位到 `0…steps.length`：NaN 或负数映射到 0，并且超过数组长度的任何值都映射到数组长度，因此超出范围或小数计数永远不会抛出，而只是向下舍入到整步。超出可见计数的步骤根本不在 DOM 中，而不仅仅是隐藏，并且每个新显示的步骤都会在超过 300 毫秒内淡出和滑动。 `label` 仅当它是真实字符串时才呈现。

## 示例 {#examples}

### 用 Frac、Sup 和 Sub 组成表达式 {#compose-an-expression-with-frac-sup-and-sub}

工具调用只能将纯文本流式传输到 `expression`，因此到达运行时的分数或上标将呈现为纯字符而不是堆叠布局。使用 `Frac`、`Sup` 和 `Sub` 构建更丰富的视觉效果是一个独立的问题：自己组装 JSX 并将其作为步骤的 `expression` 传递，并且它在任一通道中以相同的方式呈现。

```tsx
import { Frac, Sub, Sup } from "@/components/assistant-ui/elements/math-block";

const steps = [
  {
    expression: (
      <>
        p(x) ={" "}
        <Frac
          over={<>1</>}
          under={
            <>
              1 + e<Sup>−x</Sup>
            </>
          }
        />
      </>
    ),
    note: "the logistic",
  },
  {
    expression: (
      <>
        最大<Sub>x</Sub> p′(x) = 0.25
      </>
    ),
  },
];
```

### 步骤的来源 {#where-the-steps-come-from}

**运行时版**

模型拥有推导，因此后端条目只需要一个足够宽的模式来描述任何有效的答案。执行器直接返回参数，第一步的渲染器完成剩下的工作。

```ts
show_derivation: tool({
  description: "Show a worked, step by step derivation.",
  inputSchema: z.object({
    label: z.string().optional(),
    steps: z.array(
      z.object({ expression: z.string(), note: z.string().optional() }),
    ),
  }),
  execute: async (args) => args,
}),
```

**独立版**

当步骤来自你自己的请求而不是固定常量时，获取它们一次并重置显示计数，以便动画从头开始播放。

```tsx
async function loadDerivation(question: string) {
  const { steps: nextSteps } = await askForWorkedAnswer(question);
  setSteps(nextSteps);
  setVisibleSteps(0);
}
```

### 调整块 {#restyle-the-block}

两种用法都支持通过 `className` 调整根元素。该标签使用 `surfaces.tsx` 的共享 `mono` 表面，因此调整该标记会调整使用它的每个元素。

```tsx
<MathBlock className="max-w-none gap-4" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 渲染属性 {#render-props}

| 属性 | 类型 | 说明 |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `args` | `{ label?: string; steps: { expression: string; note?: string }[] }` | 由模型流式传输的工具参数，部分解析，而 `status.type` 是 `"running"`。 |
| `status` | `ToolCallMessagePartStatus` | `"running"`，而一旦调用建立，模型仍会发出 `args`、`"complete"`。 |

### show_derivation 参数 {#showderivation-arguments}

| 字段 | 类型 | 说明 |
| -------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `label` | `string` | 步骤上方显示的可选标题。 |
| `steps[].expression` | `string` | 呈现为纯文本，如果步骤需要，请自行组装 `Frac`、`Sup` 和 `Sub`。 |
| `steps[].note` | `string` | 表达式下可选的小标题。 |

**独立版**

### MathBlock {#mathblock}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | --------------------- | -------- | ------------------------------------------------------------------ |
| `label` | `string` |  | 步骤上方显示的可选标题。 |
| `steps` | `readonly MathStep[]` |  | 完整的步骤列表，仅第一个 `visibleSteps` 渲染。 |
| `visibleSteps` | `number` |  | 要显示、落地并夹入 `0…steps.length` 的步数。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。

### MathStep {#mathstep}

| 字段 | 类型 | 说明 |
| ------------ | ----------- | ------------------------------------------------------------------------------------- |
| `expression` | `ReactNode` | 步骤的表达式。接受纯文本或从 `Frac`、`Sup` 和 `Sub` 构建的 JSX。 |
| `note` | `string` | 表达式下的可选标题。 |
