---
title: Web search（网页搜索）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Web search（网页搜索）

展示搜索词和陆续返回的结果。

Web 搜索显示胶囊形标签中的实时查询、状态行和不断增长的结果列表，每个结果都带有域字母头像、标题和源域。在运行时，查询和结果来自模型创建的工具调用。独立的你驱动`query`，`results`，其中有多少是可见的。

<demo react="assistant-ui/web-search-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-web-search"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-web-search.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

搜索工具通过该工具自己的工具包条目进行呈现：模型的参数作为 `args` 到达，提供者的结果作为 `result` 到达，调用的生命周期作为 `status` 到达。

### 定义搜索工具包 {#define-the-search-toolkit}

```tsx
"use generative";

import { defineToolkit, externalTool } from "@assistant-ui/react";
import { WebSearch } from "@/components/assistant-ui/elements/web-search";

export default defineToolkit({
  web_search: {
    execute: externalTool(),
    render: ({ args, result, status }) => (
      <WebSearch
        query={args.query ?? ""}
        results={result?.results ?? []}
        visibleResults={result?.results.length ?? 0}
        searching={status.type === "running"}
        cycle={0}
      />
    ),
  },
});
```

   `execute: externalTool()` 标记后端路由或提供程序运行的工具，而不是浏览器：编译器将其从客户端捆绑包中删除并仅保留 `render`。当搜索本身应该在客户端运行时，请给 `execute` 一个真正的函数。

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

   现在，会话中的每个 `web_search` 工具调用都会呈现为此元素，无论 `MessagePrimitive.Parts` 将其放置在助手的回复中的何处。

**独立版**

独立版中，`WebSearch` 是完全控制的：你保存查询、完整结果列表以及要显示的结果的计数。

### 保持搜索状态 {#hold-the-search-state}

```tsx
"use client";

import { useState } from "react";
import {
  WebSearch,
  type WebSearchResult,
} from "@/components/assistant-ui/elements/web-search";

const RESULTS: readonly WebSearchResult[] = [
  { title: "跨线程持久保存输入框状态", domain: "assistant-ui.com" },
  { title: "聊天 UI 中的草稿自动保存模式", domain: "patterns.dev" },
];

export function Search() {
  const [searching, setSearching] = useState(true);
  const [visibleResults, setVisibleResults] = useState(0);

  return (
    <WebSearch
      query="assistant-ui draft persistence"
      results={RESULTS}
      visibleResults={visibleResults}
      searching={searching}
      cycle={0}
    />
  );
}
```

### 搜索完成后显示结果 {#reveal-results-as-the-search-finishes}

   一旦结果准备好，关闭 `searching` 并向上步进 `visibleResults`，而不是直接跳到完整列表：

```tsx
useEffect(() => {
  fetchResults(query).then((found) => {
    setSearching(false);
    found.forEach((_, i) => {
      setTimeout(() => setVisibleResults((n) => Math.max(n, i + 1)), i * 300);
    });
  });
}, [query]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="web-search">
  <span>{/* query, in a rounded field with a search icon */}</span>
  <div>{/* "Searching" (shimmer) while searching, else fixed "Read 3 sources" text */}</div>
  <div>{/* the first `visibleResults` results: domain-initial avatar, title, domain */}</div>
</div>
```

`visibleResults` 钳位到 `0…results.length`，因此超出范围的值永远不会抛出：负数或 `NaN` 不显示任何内容，超过末尾的值显示所有内容。 “Read 3sources”行是源代码中的文字文本，不是从 `results.length` 派生的。如果计数应该跟踪你传入的内容，请直接编辑它。`cycle` 会混合到每个可见结果的键中，因此即使 `results` 和 `visibleResults` 未更改，碰撞它也会重新触发入口动画，这对于以相同形状的答案再次运行的搜索很有用。空的 `results` 数组呈现状态行，其下方没有行。无论哪种方式，结果区域都会保持其保留高度。

## 示例 {#examples}

### 在查询到达时对其进行流式传输 {#streaming-the-query-as-it-arrives}

**运行时版**

`args.query` 是模型仍在编写工具调用时的部分解析。 `useToolArgsStatus` 报告哪些参数字段仍在流式传输，因此该丸可以保存占位符而不是半类型字符串：

```tsx
import { useToolArgsStatus, type ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  WebSearch,
  type WebSearchResult,
} from "@/components/assistant-ui/elements/web-search";

type SearchArgs = { query: string };
type SearchResult = { results: WebSearchResult[] };

function SearchToolUI({
  args,
  result,
  status,
}: ToolCallMessagePartProps<SearchArgs, SearchResult>) {
  const { propStatus } = useToolArgsStatus<SearchArgs>();

  return (
    <WebSearch
      query={propStatus.query === "streaming" ? "Searching…" : (args.query ?? "")}
      results={result?.results ?? []}
      visibleResults={result?.results.length ?? 0}
      searching={status.type === "running"}
      cycle={0}
    />
  );
}
```

### 调整结果 {#restyle-the-results}

两种用法都支持通过 `className` 调整根元素。查询标签使用共享的 `field` 表面，域标签使用 `mono`，两者都来自 `surfaces.tsx`，因此重新主题化这些标记会重新主题化基于它们的每个元素。

```tsx
<WebSearch className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具渲染属性 {#tool-render-props}

| 属性 | 类型 | 说明 |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `args` | `{ query?: string }` | 模型提供的参数。流式传输时部分。使用 `useToolArgsStatus` 来区分已完成的字段和尚未到达的字段。 |
| `result` | `{ results: WebSearchResult[] } \| undefined` | 工具调用解析后设置。 |
| `status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | 调用的生命周期。 `"running"` 是唯一应该显示搜索闪光的状态。 |

`WebSearchResult` 是 `{ title: string; domain: string }`。有关完整的工具调用片段形状，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### WebSearch {#websearch}

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query` | `string` |  | 胶囊形标签中显示的搜索查询。 |
| `results` | `readonly WebSearchResult[]` |  | 完整结果列表。 |
| `visibleResults` | `number` |  | 从`results`开始，要渲染多少个结果。 |
| `searching` | `boolean` |  | 如果为 true，则显示闪烁的“搜索”标签来代替结果计数。 |
| `cycle` | `number` |  | 混合到每个结果的键中以强制其入口动画重播。传递一个在搜索之间碰撞的值，或者如果你只搜索一次，则传递一个常量。 |
| `className` | `string` |  | 合并到根元素。 |

`WebSearchResult` 是 `{ title: string; domain: string }`。其余 `div` 属性会传给根元素。
