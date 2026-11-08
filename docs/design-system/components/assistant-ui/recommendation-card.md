---
title: Recommendation card（建议卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Recommendation card（建议卡片）

在对话里提出建议，解释理由，并允许用户接受或查看备选项。

<demo react="assistant-ui/recommendation-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-recommendation-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-recommendation-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染工具调用

用工具参数提供建议内容。工具有 result 时切换为 "accepted"，点击接受时只调用一次 `addResult`。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { RecommendationCard } from "@/components/assistant-ui/elements/recommendation-card";

export const toolkit = defineToolkit({
  propose_change: {
    type: "human",
    description: "提出一项更改并等待用户接受。",
    parameters: z.object({
      question: z.string(),
      detail: z.string(),
      confidenceLabel: z.string(),
      acceptedLabel: z.string(),
    }),
    render: ({ args, status, result, addResult }) => {
      if (status.type === "running" || status.type === "incomplete") return null;

      return (
        <RecommendationCard
          state={result ? "accepted" : "idle"}
          question={args.question}
          confidenceLabel={args.confidenceLabel}
          acceptedLabel={args.acceptedLabel}
          onAccept={() => addResult({ accepted: true })}
          onAlternatives={() => addResult({ accepted: false })}
        >
          {args.detail}
        </RecommendationCard>
      );
    },
  },
});
```

### 注册工具包

把工具包注册到运行时，让消息列表在工具调用位置显示建议。

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存建议状态

独立版保存 "idle" 或 "accepted" 状态，用 children 填写建议详情。

```tsx
"use client";

import { useState } from "react";
import {
  RecommendationCard,
  type RecommendationState,
} from "@/components/assistant-ui/elements/recommendation-card";

export function Recommendation() {
  const [state, setState] = useState<RecommendationState>("idle");

  return (
    <RecommendationCard
      state={state}
      question="是否启用草稿自动保存？"
      confidenceLabel="可信度高"
      acceptedLabel="已为所有会话启用"
      onAccept={() => setState("accepted")}
      onAlternatives={() => showAlternatives()}
    >
      Threads lose their draft on switch. Wiring runtime.drafts fixes it with
      three lines and no migration.
    </RecommendationCard>
  );
}
```

### 处理备选方案

将 `onAlternatives` 连到应用的备选方案入口。

```tsx
function showAlternatives() {
  setOptionsOpen(true);
}
```

## 结构 {#anatomy}

标题显示建议问题，正文解释理由。底部显示可信度和操作，接受后换成已接受回执。

```tsx
<div data-slot="recommendation-card">
  <p>{/* 对应槽位内容 */}</p>
  <p>{/* 正文内容 */}</p>
  <div>
    {/* 显示对应条目 */}
    {/* 显示对应状态 */}
  </div>
</div>
```

可信度图标的三个条形高度固定，`confidenceLabel` 提供实际的可信度提示。调用方可随时变更 `state`，决定显示操作或回执。

## 示例 {#examples}

### 调整卡片样式

在根元素上应用 `className`。

```tsx
<RecommendationCard className="max-w-md" /* ... */ />
```

### 没有备选方案

省略 `onAlternatives`，保留接受建议的操作。

```tsx
<RecommendationCard onAccept={() => setState("accepted")} /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 来源 | 类型 | 说明 |
| --------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `args.question` / `args.confidenceLabel` / `args.acceptedLabel` | `string` | 标题中的建议或问题。 可信度提示的文字。 建议已接受时的文案。 |
| `args.detail` | `string` | 补充详情。 |
| `result` | `unknown` | 工具调用结果。工具尚未返回时为 undefined。 |
| `addResult(result)` | `(result: TResult) => void` | 提交结果并完成工具调用。 |

**独立使用**

### RecommendationCard

| 属性 | 类型 | 默认值 | 说明 |
| ----------------- | ---------------------- | -------- | --------------------------------------- |
| `state` | `"idle" \| "accepted"` | 必填 | 当前展示状态，决定图标及可用操作。 |
| `question` | `string` | 必填 | 标题中的建议或问题。 |
| `children` | `ReactNode` | 必填 | 放入该组件的内容。 |
| `confidenceLabel` | `string` | 必填 | 可信度提示的文字。 |
| `acceptedLabel` | `string` | 必填 | 建议已接受时的文案。 |
| `onAccept` | `() => void` |  | 用户接受建议时调用。 |
| `onAlternatives` | `() => void` |  | 用户请求备选方案时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
