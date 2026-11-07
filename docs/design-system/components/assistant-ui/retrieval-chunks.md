---
title: Retrieval chunks（检索片段）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Retrieval chunks（检索片段）

在回答到达前，展示检索到的段落及相关度。

检索块显示查询、状态行和检索调用找到的段落，每个段落都有其来源、定位器、相关性分数和分数栏。在运行时，查询和段落来自模型制作的工具调用。独立的你驱动`query`，`chunks`，其中有多少是可见的。

<demo react="assistant-ui/retrieval-chunks-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-retrieval-chunks"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-retrieval-chunks.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

检索工具通过该工具自己的工具包条目进行呈现：模型的查询作为 `args` 到达，检索到的段落作为 `result`，调用的生命周期作为 `status`。

### 定义检索工具包 {#define-the-retrieval-toolkit}

```tsx
"use generative";

import { defineToolkit, externalTool } from "@assistant-ui/react";
import { RetrievalChunks } from "@/components/assistant-ui/elements/retrieval-chunks";

export default defineToolkit({
  search_docs: {
    execute: externalTool(),
    render: ({ args, result, status }) => (
      <RetrievalChunks
        query={args.query ?? ""}
        chunks={result?.chunks ?? []}
        visibleCount={result?.chunks.length ?? 0}
        searching={status.type === "running"}
      />
    ),
  },
});
```

   `execute: externalTool()` 标记后端路由或向量存储运行的工具，而不是浏览器：编译器将其从客户端包中删除并仅保留 `render`。

### 注册工具包 {#register-the-toolkit}

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import toolkit from "./toolkit";

export function App() {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

   现在，会话中的每个 `search_docs` 工具调用都会呈现为此元素，无论 `MessagePrimitive.Parts` 将其放置在助手的回复中的何处。

**独立版**

独立版中，`RetrievalChunks` 是完全控制的：你保存查询、完整的块列表以及其中有多少是可见的。

### 保持检索状态 {#hold-the-retrieval-state}

```tsx
"use client";

import { useState } from "react";
import {
  RetrievalChunks,
  type RetrievalChunk,
} from "@/components/assistant-ui/elements/retrieval-chunks";

const CHUNKS: readonly RetrievalChunk[] = [
  {
    id: "c1",
    source: "migration-0.14.md",
    locator: "§ 2",
    score: 0.91,
    text: "输入框拥有从 0.14 开始的草稿。",
  },
  {
    id: "c2",
    source: "composer.tsx",
    locator: "L12",
    score: 0.84,
    text: "useDraft(threadId) 订阅每线程草稿槽。",
  },
];

export function Retrieval() {
  const [searching, setSearching] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);

  return (
    <RetrievalChunks
      query="how does draft restore work"
      chunks={CHUNKS}
      visibleCount={visibleCount}
      searching={searching}
    />
  );
}
```

### 检索完成时显示块 {#reveal-chunks-as-retrieval-finishes}

   关闭 `searching` 并在段落准备好后向上步进 `visibleCount`，而不是直接跳到完整列表：

```tsx
useEffect(() => {
  fetchChunks(query).then((found) => {
    setSearching(false);
    found.forEach((_, i) => {
      setTimeout(() => setVisibleCount((n) => Math.max(n, i + 1)), i * 250);
    });
  });
}, [query]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="retrieval-chunks">
  <span>{/* query, in a rounded field with a database icon */}</span>
  <div>{/* "Retrieving" (shimmer) while searching, else "N passages above threshold" */}</div>
  <div>
    {/* the first `visibleCount` chunks: source, locator, score, snippet, named score meter */}
  </div>
</div>
```

`visibleCount` 钳位到 `0…chunks.length`，因此超出范围的值永远不会抛出：负数或 `NaN` 不显示任何内容，超过末尾的值显示所有内容。与网络搜索不同，状态行在检索完成后会读取 `chunks.length`。块的得分栏以 `1` 的百分比填充到 `score`，并且其轨道是一个命名仪表，公开 `0…100` 值以及读取行打印的相同 `score` 的值文本。在 `0.8` 及以上，乐谱文本变为翠绿色。下面的任何内容都以柔和的前景色读取。 `text` 被限制为两行，并且不会自行扩展。

## 示例 {#examples}

### 渲染前按分数过滤 {#filtering-by-score-before-rendering}

元素中没有任何内容强制执行相关性底限：传递较短的 `chunks` 数组以将段落删除到低于你自己的阈值，而不是尝试使用 `visibleCount` 隐藏它们。

```tsx
<RetrievalChunks
  query={query}
  chunks={chunks.filter((c) => c.score >= 0.5)}
  visibleCount={chunks.length}
  searching={searching}
/>
```

### 调整块的样式 {#restyle-the-chunks}

两种用法都支持通过 `className` 调整根元素。查询标签使用共享的 `field` 表面，块卡使用 `paper`，定位器和分数使用 `mono`，全部来自 `surfaces.tsx`。

```tsx
<RetrievalChunks className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具渲染属性 {#tool-render-props}

| 属性 | 类型 | 说明 |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `args` | `{ query?: string }` | 模型提供的参数。流式传输时部分。 |
| `result` | `{ chunks: RetrievalChunk[] } \| undefined` | 工具调用解析后设置。 |
| `status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | 调用的生命周期。 `"running"` 是唯一应该显示检索闪光的状态。 |

`RetrievalChunk` 是 `{ id: string; source: string; locator: string; score: number; text: string }`。有关完整的工具调用片段形状，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### RetrievalChunks {#retrievalchunks}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | --------------------------- | -------- | --------------------------------------------------------------------------------- |
| `query` | `string` |  | 胶囊形标签中显示的查询。 |
| `chunks` | `readonly RetrievalChunk[]` |  | 完整的段落列表。 |
| `visibleCount` | `number` |  | 从 `chunks` 开始有多少块要渲染。 |
| `searching` | `boolean` |  | 如果为真，则显示闪烁的“检索”标签来代替段落计数。 |
| `className` | `string` |  | 合并到根元素。 |

`RetrievalChunk` 是 `{ id: string; source: string; locator: string; score: number; text: string }`。其余 `div` 属性会传给根元素。
