---
title: Score breakdown（评分明细）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Score breakdown（评分明细）

用总分、评语和各项指标解释一次评分。

<demo react="assistant-ui/score-breakdown-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-score-breakdown"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-score-breakdown.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 注册渲染函数

在 review_change 渲染器中等待 result，再把 verdict、total、`outOf` 和 criteria 传入组件。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { ScoreBreakdown } from "@/components/assistant-ui/elements/score-breakdown";

export const toolkit = defineToolkit({
  review_change: {
    type: "backend",
    render: ({ args, result }) => {
      if (!result) return <p>Reviewing {args.target}…</p>;
      return (
        <ScoreBreakdown
          verdict={result.verdict}
          total={result.total}
          outOf={result.outOf}
          criteria={result.criteria}
          visibleCount={result.criteria.length}
        />
      );
    },
  },
});
```

### 由消息列表渲染

将工具包注册到运行时，消息列表在评分工具的调用位置呈现结果。

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

### 直接传入指标

直接传入评分和完整指标数组，通过 `visibleCount` 决定显示几项。

```tsx
"use client";

import {
  ScoreBreakdown,
  type ScoreCriterion,
} from "@/components/assistant-ui/elements/score-breakdown";

const criteria: readonly ScoreCriterion[] = [
  {
    label: "解决根本原因",
    score: 4.5,
    weight: 3,
    note: "在来源处清理该槽位。",
  },
  { label: "测试覆盖率", score: 4, weight: 2 },
  { label: "改动范围", score: 3, weight: 1 },
];

export function ReviewVerdict() {
  return (
    <ScoreBreakdown
      verdict="通过"
      total={4.1}
      outOf={5}
      criteria={criteria}
      visibleCount={criteria.length}
    />
  );
}
```

### 逐项显示指标

可以随评分过程增加 `visibleCount`，超过范围的值会被限制。

```tsx
"use client";

import { useEffect, useState } from "react";

export function ReviewVerdict() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= criteria.length) return;
    const id = setTimeout(() => setVisibleCount((n) => n + 1), 600);
    return () => clearTimeout(id);
  }, [visibleCount]);

  return (
    <ScoreBreakdown
      verdict="通过"
      total={4.1}
      outOf={5}
      criteria={criteria}
      visibleCount={visibleCount}
    />
  );
}
```

## 结构 {#anatomy}

顶部显示结论和总分，下方逐项显示分数、进度条、权重和可选说明。进度条按 `outOf` 缩放，weight 仅显示为倍率。

```tsx
<div data-slot="score-breakdown">
  <div>
    <span>{/* total.toFixed(1) */}</span>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>

  <div>
    {/* 逐项渲染 */}
    <div>
      <span>{/* criterion.label */}</span>
      <span>{/* 对应槽位内容 */}</span>
      <span>{/* criterion.score.toFixed(1) */}</span>
    </div>
    <span role="meter">{/* 显示名称或标题 */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
</div>
```

即使 `visibleCount` 为 0，顶部仍会显示总分、满分和评语。评语色调取决于总分比率：达到 75% 为绿色，50% 至不足 75% 为琥珀色，其余为红色。满分为 0 时按 0% 处理。

## 示例 {#examples}

### 满分为零

`outOf` 为 0 时，进度条按空条处理，避免除零。

```tsx
<ScoreBreakdown
  verdict="未评分"
  total={0}
  outOf={0}
  criteria={[]}
  visibleCount={0}
/>
```

### 评分来源

运行时从后端工具结果读取评分，独立版由调用方提供相同字段。

**使用运行时**

```tsx
review_change: tool({
  description: "按评分标准评价拟议变更。",
  inputSchema: z.object({ target: z.string() }),
  execute: async ({ target }) => gradeChange(target),
}),
```

**独立使用**

```tsx
async function loadReview(target: string) {
  const verdict = await gradeChange(target);
  setCriteria(verdict.criteria);
  setVisibleCount(0);
}
```

### 调整评分面板样式

通过 `className` 调整根元素。

```tsx
<ScoreBreakdown className="max-w-none gap-4" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 属性 | 类型 | 说明 |
| -------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `args` | `{ target: string }` | 工具调用参数。流式调用尚未结束时，内容可能只解析了一部分。 |
| `result` | `{ verdict: string; total: number; outOf: number; criteria: ScoreCriterion[] } \| undefined` | 后端评分结果，执行完成前为 undefined。 |

### review_change 结果

| 字段 | 类型 | 说明 |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `verdict` | `string` | 概括评分结论的标签。 |
| `total` | `number` | 总分或总量。 |
| `outOf` | `number` | 总分上限，也是各项进度条的分母。 |
| `criteria[].label` | `string` | 要显示的标签。 |
| `criteria[].score` | `number` | 本项得分，显示一位小数。 |
| `criteria[].weight` | `number` | 当前条目的权重。 |
| `criteria[].note` | `string` | 分数条下方的说明。 |

**独立使用**

### ScoreBreakdown

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | --------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `verdict` | `string` | 必填 | 概括评分结论的标签。 |
| `total` | `number` | 必填 | 总分或总量。 |
| `outOf` | `number` | 必填 | 总分上限，也是各项进度条的分母。 |
| `criteria` | `readonly ScoreCriterion[]` | 必填 | 按展示顺序提供的评分指标。 |
| `visibleCount` | `number` | 必填 | 可显示的条目数，限制在 0 和总条目数之间。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### ScoreCriterion

| 字段 | 类型 | 说明 |
| -------- | -------- | ------------------------------------------------------- |
| `label` | `string` | 要显示的标签。 |
| `score` | `number` | 本项得分，显示一位小数。 |
| `weight` | `number` | 显示为 ×weight，不改变评分条宽度。 |
| `note` | `string` | 分数条下方的说明。 |
