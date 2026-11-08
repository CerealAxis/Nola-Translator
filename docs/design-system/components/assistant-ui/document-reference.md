---
title: Document reference（文档引用）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Document reference（文档引用）

展示文档引用的原文片段，并提供跳转到对应页码的入口。

DocumentReference 是一个源文档的引文卡：命名文件的标题，然后是你可以在其之间切换的页面锚点列表。在运行时，锚点来自读取文档的工具调用。独立的你已经持有它们。

<demo react="assistant-ui/document-reference-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-document-reference"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-document-reference.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui 的内置 `source` 消息部分涵盖单个文档引用（标题、文件名），但不包含带有引用段落的页面锚点列表。该形状最接近的真实构建块是工具调用：要求模型读取文档并返回其锚点，然后渲染结果。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  DocumentReference,
  type DocumentAnchor,
} from "@/components/assistant-ui/elements/document-reference";

type ReadDocumentResult = {
  title: string;
  pages: number;
  anchors: DocumentAnchor[];
};

export const ReadDocumentToolUI: ToolCallMessagePartComponent<
  { query: string },
  ReadDocumentResult
> = ({ result }) => {
  const [activePage, setActivePage] = useState<number>();

  if (!result) return null;
  const page = activePage ?? result.anchors[0]?.page ?? 1;

  return (
    <DocumentReference
      title={result.title}
      pages={result.pages}
      anchors={result.anchors}
      activePage={page}
      onJump={setActivePage}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { ReadDocumentToolUI } from "@/components/assistant-ui/elements/read-document-tool-ui";

export const toolkit = defineToolkit({
  read_document: {
    type: "frontend",
    description: "Open a document and return the passages that answer the question.",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => lookupDocument(query),
    render: ReadDocumentToolUI,
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

   请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)，了解后端定义的工具和授权请求。

**独立版**

独立，该元素是完全控制的：你持有锚点列表和活动页面，它会向你报告跳转。

### 维护当前页面 {#hold-the-active-page}

```tsx
"use client";

import { useState } from "react";
import { DocumentReference } from "@/components/assistant-ui/elements/document-reference";

const ANCHORS = [
  { page: 4, quote: "Composer state moved off the thread runtime in 0.14." },
  { page: 9, quote: "Existing drafts migrate on first read; nothing to run by hand." },
];

export function Citation() {
  const [activePage, setActivePage] = useState(ANCHORS[0].page);
  return (
    <DocumentReference
      title="迁移-0.14.md"
      pages={12}
      anchors={ANCHORS}
      activePage={activePage}
      onJump={setActivePage}
    />
  );
}
```

### 替换锚列表 {#replace-the-anchor-list}

   打开不同的文档会交换整个文档集并将活动页面重置为其第一个锚点。

```tsx
async function openDocument(id: string) {
  const doc = await fetchDocument(id);
  setTitle(doc.title);
  setPages(doc.pages);
  setAnchors(doc.anchors);
  setActivePage(doc.anchors[0]?.page ?? 1);
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="document-reference">
  <div>
    <span>{/* file icon in a tinted square */}</span>
    <div>
      <span>{title}</span>
      <span>{/* "N pages · M cited" */}</span>
    </div>
  </div>
  <div>
    {/* one button per anchor: "p. N" above the quoted passage */}
  </div>
</div>
```

`activePage` 决定两个独立的事情。每个 `page` 等于 `activePage` 的锚点都会获得活动背景，当多个锚点引用同一页面时，该背景可以是多个按钮。只有该页面上的数组顺序中的第一个锚点才获得 `aria-current`，因为它是由 `anchors.findIndex` 找到的。当 `activePage` 没有匹配锚点时，也没有按钮匹配。单击按钮会使用该锚点的 `page`（而不是其数组索引）调用 `onJump`，因此一旦单击，调用者就无法区分两个同一页面的锚点。空的 `anchors` 数组仅呈现标题，元行中包含 `0 cited`，并且没有占位符行。

## 示例 {#examples}

### 同一页多次引用 {#multiple-citations-on-the-same-page}

每页的锚点不必是唯一的。当 `activePage` 为 4 时，引用第 4 页的两个条目都会突出显示。只有数组中的第一个被标记为当前用于辅助技术。

```tsx
const anchors = [
  { page: 4, quote: "The runtime owns branch state; nothing local to track." },
  { page: 4, quote: "Reloading a message creates a sibling branch automatically." },
];
```

### 调整卡片 {#restyle-the-card}

两种用法都在根元素采用 `className`，它读取共享的 `paper` 标记。活动锚点的背景为 `field`，元线和每个锚点的页面标签为 `mono`，两者都在 `surfaces.tsx` 中。

```tsx
<DocumentReference className="max-w-none gap-4" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### DocumentReference {#documentreference}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `title` | `string` |  | 标题文本。隐藏本机 `title` 属性，该属性已从转发的 props 中删除。 |
| `pages` | `number` |  | 总页数，显示在标题元行中。未与 `anchors` 进行交叉检查。 |
| `anchors` | `readonly DocumentAnchor[]` |  | 列出的引文，按顺序排列。 |
| `activePage` | `number` |  | 要突出显示的页码。可以匹配零个、一个或多个锚点。 |
| `onJump` | `(page: number) => void` |  | 当按下锚点时，使用锚点的 `page` 进行调用。如果没有它，锚点将呈现为非交互式参考行。 |
| `className` | `string` |  | 合并到根元素。 |

### DocumentAnchor {#documentanchor}

| 字段 | 类型 | 说明 |
| ------- | -------- | ----------------------------------------------- |
| `page` | `number` | 该锚点引用的页码。 |
| `quote` | `string` | 页码下方显示的引用段落。 |

其余 `div` 属性会传给根元素，除了 `title`（组件自己的属性替换）。
