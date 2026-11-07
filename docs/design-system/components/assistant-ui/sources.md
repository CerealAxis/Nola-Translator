---
title: Sources（来源）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Sources（来源）

以来源标签或卡片呈现消息引用的网页和文档。

<demo react="assistant-ui/sources-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/sources"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

也可安装通过属性传值的独立组件。

```bash
npx shadcn@latest add "@assistant-ui/elements-sources"
```

## 快速开始 {#getting-started}

运行时版本读取来源片段，独立卡片直接接收来源数据。

### 注册来源渲染器 {#register-the-message-source-renderer}

在 `MessagePrimitive.Parts` 中注册来源组件，让消息自动渲染来源片段。

```tsx
import { Sources } from "@/components/assistant-ui/elements/sources.aui";
import { MessagePrimitive } from "@assistant-ui/react";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Source: Sources }} />
    </MessagePrimitive.Root>
  );
}
```

### 渲染来源卡片 {#render-source-cards}

将已知的来源数组直接传给 `Sources`，用于应用管理的参考资料。

```tsx
"use client";

import { useState } from "react";
import { Sources, type Source } from "@/components/assistant-ui/elements/sources";

const sources: Source[] = [
  {
    title: "你可能不需要 Effect",
    url: "https://react.dev/learn/you-might-not-need-an-effect",
    snippet: "优先在渲染过程中派生值，再考虑使用 Effect。",
    author: "React Team",
    publishedAt: "2024-10-01",
  },
];

export function Citations() {
  const [open, setOpen] = useState(false);

  return (
    <Sources
      sources={sources}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
```

## 结构 {#anatomy}

运行时来源标签适合消息行内，静态卡片可以容纳更多描述。

### 运行时来源标签 {#runtime-source-chip}

从当前片段读取标题和链接。用户可直接打开来源。

```tsx
{/* sourceType: "url" */}
<a data-slot="source" href={safeHref(url)}>
  <img data-slot="source-icon" />
  <span data-slot="source-title">{title ?? domain}</span>
</a>

{/* sourceType: "document" */}
<span data-slot="source">
  <span data-slot="source-document-icon" />
  <span data-slot="source-title">{title}</span>
</span>
```

### 静态来源卡片 {#static-source-card}

可以展示标题、站点信息、图标和说明。

```tsx
<a data-slot="source-card" href={safeHref(source.url)}>
  <span>{domain}</span>
  <span>{source.title}</span>
  <span>{source.snippet}</span>
  <span>{source.author} · {formatPublishedAt(source.publishedAt, locale)}</span>
</a>
```

## 示例 {#examples}

用站点图标或附加说明补充来源信息。

### 自定义站点图标 {#custom-favicon}

来源提供图标地址时可显示自定义图标，缺少图标时保留默认表示。

```tsx
import { safeHref } from "@/components/assistant-ui/utils/href";
import { Source, SourceIcon, SourceTitle } from "@/components/assistant-ui/elements/sources.aui";

function CustomSource({ url, title }: { url: string; title: string }) {
  const href = safeHref(url);
  if (!href) return <span>{title}</span>;

  return (
    <Source href={href} variant="secondary">
      <SourceIcon
        url={url}
        faviconUrl={(domain) => `https://logo.clearbit.com/${domain}`}
      />
      <SourceTitle>{title}</SourceTitle>
    </Source>
  );
}
```

### 链接引用的详情 {#linked-reference-details}

使用可读标题、站点和简短说明，帮助用户判断是否打开原文。

```tsx
const sources = [
  {
    title: "运行时草稿 API",
    url: "https://www.assistant-ui.com/docs/runtimes",
    snippet: "在线程运行时进行流式传输或重新连接时保留草稿。",
    author: "assistant-ui",
    publishedAt: "2025-09-16",
  },
];
```

## API 参考 {#api-reference}

运行时绑定与独立卡片使用不同的数据入口。

### 运行时绑定 {#runtime-bindings}

消息渲染器接收当前来源片段，应用负责让服务端返回该片段。

### 来源片段 {#source-part}

来源可以是链接或文档。片段类型决定可用的地址、文件名和媒体类型字段。

### 静态卡片属性 {#static-card-props}

传入 `sources: readonly Source[]`，使用 `open` 与 `onOpenChange` 控制展开。 `layout` 在双列网格和单行列表间切换；`hideTrigger` 可隐藏默认触发器。 `locale` 决定日期显示格式，默认 `"en-US"`。

### 来源字段 {#source-fields}

来源通常包括标题、URL、站点图标与简短说明。
