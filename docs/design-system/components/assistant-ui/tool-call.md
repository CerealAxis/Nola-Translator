---
title: Tool call（工具调用）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Tool call（工具调用）

把单次工具调用的请求与结果放在可展开的区域里。

工具调用在工作时会折叠成一行：一个 V 形、一个闪烁的标签，以及该工具作为标签的主要参数，一旦稳定，就会有一个复选标记。单击它会显示原始请求和结果。对于运行时，请求、结果和运行状态来自匹配的工具调用部分。独立版由调用方直接提供命令和结果。

<demo react="assistant-ui/tool-call-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-tool-call"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-tool-call.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

工具调用通过工具包条目的 `render` 字段呈现，而不是通过独立的基元树。渲染器接收该调用的实时 `args`、`argsText`、`result` 和 `status`。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolCall } from "@/components/assistant-ui/elements/tool-call";

export type SearchDocsResult = { count: number; bestPath: string };

export const SearchDocsToolUI: ToolCallMessagePartComponent<
  { query: string },
  SearchDocsResult
> = ({ args, argsText, result, status }) => {
  const [open, setOpen] = useState(false);
  return (
    <ToolCall
      label="搜索文档"
      activeLabel="Searching the docs"
      query={args.query ?? ""}
      request={argsText}
      result={result ? `${result.count} matches, best hit ${result.bestPath}` : ""}
      running={status.type === "running"}
      open={open}
      onOpenChange={setOpen}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import {
  SearchDocsToolUI,
  type SearchDocsResult,
} from "@/components/assistant-ui/elements/search-docs-tool-ui";

export const toolkit = defineToolkit({
  search_docs: {
    type: "frontend",
    description: "搜索assistant-ui文档。",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json() as Promise<SearchDocsResult>;
    },
    render: SearchDocsToolUI,
  },
});
```

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

   请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)，了解后端定义的工具、人工工具和授权请求。

**独立版**

独立，该元素是完全控制的：它显示的每个字符串及其打开状态都是你拥有的属性。

### 维护展开状态 {#hold-the-open-state}

```tsx
"use client";

import { useState } from "react";
import { ToolCall } from "@/components/assistant-ui/elements/tool-call";

export function DocsSearchCall() {
  const [open, setOpen] = useState(false);

  return (
    <ToolCall
      label="搜索文档"
      activeLabel="Searching the docs"
      query="draft persistence"
      request='{"query": "draft persistence"}'
      result="3 matches, best hit /docs/runtime/drafts"
      running={false}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
```

### 从请求中提供数据 {#fill-it-from-your-own-request}

   `running`、`result`，这两个标签是纯字符串和布尔值，因此任何异步调用都可以直接驱动它们：

```tsx
async function search(query: string) {
  setRunning(true);
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).then((r) =>
    r.json(),
  );
  setResult(`${res.count} matches, best hit ${res.bestPath}`);
  setRunning(false);
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="tool-call">
  <button>
    {/* chevron, shimmering label while running, query chip, checkmark once settled */}
  </button>
  <div>{/* Request block, divider, Result block — mounted only while open */}</div>
</div>
```

触发器始终可见。仅当 `running` 变为 false 时，复选标记才会替换空白区域。内容面板的高度在零和测量高度之间动态变化，因此打开和关闭永远不会跳跃。 `open` 受控：元素不保持内部打开状态，并在单击触发器时调用 `onOpenChange`。没有禁用状态。使用空请求或结果的工具调用会呈现空字符串。

## 示例 {#examples}

### 调整展开面板样式 {#restyle-the-disclosure}

两种用法都支持通过 `className` 调整根元素。触发器、查询标签以及请求和结果块从 `surfaces.tsx` 中的共享 `mono`、`field` 和 `collapsePanel` 标记中读取，因此重新设置这些标记会立即重新设置每个基于披露的元素的样式。

```tsx
<ToolCall className="max-w-none" /* ... */ />
```

**运行时版**

### 注册更多工具 {#registering-more-tools}

渲染器工厂将标签对排除在工具包定义之外，因此同一组件支持多个搜索型工具：

```tsx
function makeSearchToolUI(label: string, activeLabel: string) {
  const SearchToolUI: ToolCallMessagePartComponent<
    { query: string },
    SearchDocsResult
  > = ({ args, argsText, result, status }) => {
    const [open, setOpen] = useState(false);
    return (
      <ToolCall
        label={label}
        activeLabel={activeLabel}
        query={args.query ?? ""}
        request={argsText}
        result={result ? `${result.count} matches, best hit ${result.bestPath}` : ""}
        running={status.type === "running"}
        open={open}
        onOpenChange={setOpen}
      />
    );
  };
  return SearchToolUI;
}

const toolkit = defineToolkit({
  search_docs: {
    /* ... */ render: makeSearchToolUI("Searched the docs", "Searching the docs"),
  },
  search_issues: {
    /* ... */ render: makeSearchToolUI("Searched issues", "Searching issues"),
  },
});
```

**独立版**

### 挂载时展开 {#opening-on-mount}

在第一次渲染时将 `open` 作为 `true` 传递（然后像往常一样在 `onOpenChange` 中翻转）以实现已经扩展的披露，例如在重放过去的运行时：

```tsx
const [open, setOpen] = useState(true);
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 模型流式传输的原始 JSON 参数文本。直接馈送 `request`。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### ToolCall {#toolcall}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------------- | -------- | -------------------------------------------------------- |
| `label` | `string` |  | 调用结束后显示的文本。 |
| `activeLabel` | `string` |  | 当 `running` 为 true 时显示闪烁文本。 |
| `query` | `string` |  | 主要参数，显示为标签旁边的标签。 |
| `request` | `string` |  | 公开面板中显示的原始请求文本。 |
| `result` | `string` |  | 结果文本显示在披露面板中。 |
| `running` | `boolean` |  | 交换标签并在 true 时隐藏复选标记。 |
| `open` | `boolean` |  | 显示面板是否展开。 |
| `onOpenChange` | `(open: boolean) => void` |  | 单击触发器时调用。 |
| `className` | `string` |  | 合并到根元素。 |

与此目录中的大多数元素不同，`ToolCall` 不会将额外的 `div` 属性传播到其根元素。仅接受上述属性。
