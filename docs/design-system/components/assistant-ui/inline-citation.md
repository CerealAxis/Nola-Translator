---
title: Inline citation（行内引用）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Inline citation（行内引用）

在正文中显示带编号的来源标记。

将散文包裹在 `InlineCitation` 中，然后在其支持的每个声明旁边放置一个 `Citation` 标记。将鼠标悬停或聚焦标记可打开包含源详细信息的紧凑预览。

<demo react="assistant-ui/inline-citation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-inline-citation"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-inline-citation.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

当运行时接收源部分或工具结果时，将每个源映射到 `Citation` 它在渲染答案中所属的位置。该元素不会从流文本推断偏移量。

### 映射来源片段 {#map-source-parts}

```tsx
"use client";

import {
  Citation,
  InlineCitation,
  type Source,
} from "@/components/assistant-ui/elements/inline-citation";

type AnswerPart =
  | { type: "text"; text: string }
  | { type: "source"; id: string; index: number; source: Source };

export function Answer({ parts }: { parts: readonly AnswerPart[] }) {
  return (
    <InlineCitation>
      {parts.map((part) =>
        part.type === "text" ? (
          part.text
        ) : (
          <Citation key={part.id} index={part.index} source={part.source} />
        ),
      )}
    </InlineCitation>
  );
}
```

   保持文本和源部分的显示顺序。 `index` 从零开始，而标记显示阅读器 `index + 1`。

### 映射工具结果 {#map-a-tool-result}

   在渲染之前将完成的工具结果转换为相同的部分。当 `domain` 不存在时，源 URL 提供显示的域：

```tsx
const parts: AnswerPart[] = [
  { type: "text", text: "最新版本支持结构化输出" },
  ...result.sources.map((source, index) => ({
    type: "source" as const,
    id: source.id,
    index,
    source: {
      title: source.title,
      snippet: source.summary,
      url: source.url,
      publishedAt: source.publishedAt,
    },
  })),
  { type: "text", text: "." },
];
```

**独立版**

独立，将标记直接放置在散文内。对于内置悬停和焦点行为，省略 `open`。

### 在正文中插入引用标记 {#place-markers-in-prose}

```tsx
import {
  Citation,
  InlineCitation,
  type Source,
} from "@/components/assistant-ui/elements/inline-citation";

const RUNTIME_SOURCE: Source = {
  title: "运行时乐观更新",
  snippet:
    "The runtime applies local edits immediately and reconciles them once the server acknowledges the write.",
  url: "https://www.assistant-ui.com",
  publishedAt: "2025-03-01T12:00:00.000Z",
};

export function Answer() {
  return (
    <InlineCitation>
      乐观更新保持线程响应
      <Citation index={0} source={RUNTIME_SOURCE} />.
    </InlineCitation>
  );
}
```

### 控制标记 {#control-a-marker}

   当另一个交互拥有打开的预览时传递 `open` 和 `onOpenChange`。单个索引使一组标记保持互斥：

```tsx
const [openIndex, setOpenIndex] = useState<number | null>(null);

<Citation
  index={0}
  source={RUNTIME_SOURCE}
  open={openIndex === 0}
  onOpenChange={(open) => setOpenIndex(open ? 0 : null)}
/>
```

## 结构 {#anatomy}

```tsx
<InlineCitation>
  支持的声明
  <Citation index={0} source={source} />.
</InlineCitation>
```

`InlineCitation` 是段落并转发其 `p` 属性。每个 `Citation` 都是一个按钮标记，可打开自己的预览卡。标记的可访问名称包括源标题，因此编号标签不必单独携带源上下文。

## 示例 {#examples}

### 包含发布详细信息

当 {#include-publication-details}

`publishedAt` 为有效日期时，其格式为月份和年份。安全的 `url` 添加一个在新选项卡中打开的 `Open source` 链接。预览中会省略无效日期或不安全的 URL。

```tsx
const SOURCE: Source = {
  title: "React useSyncExternalStore 参考",
  snippet: "Subscribes to an external store with a consistent snapshot.",
  url: "https://react.dev/reference/react/useSyncExternalStore",
  publishedAt: "2024-12-05T12:00:00.000Z",
};
```

### 为段落留出更多空间 {#give-the-paragraph-more-room}

默认段落保持紧凑。当周围布局需要不同的宽度或标签时，传递 `className` 或任何其他段落属性：

```tsx
<InlineCitation className="max-w-none" aria-label="答案来源">
  部署成功完成
  <Citation index={0} source={SOURCE} />.
</InlineCitation>
```

## API 参考 {#api-reference}

**运行时版**

### 运行时映射 {#runtime-mapping}

| 值 | 类型 | 说明 |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 文字部分 | `{ type: "text"; text: string }` | 直接在 `InlineCitation` 内部渲染。 |
| 源部分 | `{ type: "source"; id: string; index: number; source: Source }` | 在散文中的该点渲染键控的 `Citation`。 |
| 工具结果 | 应用定义 | 在渲染之前将源记录从已完成的结果转换为源部分。 |

**独立版**

### InlineCitation {#inlinecitation}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ----------- | ------- | ------------------------------------------------------------ |
| `children` | `ReactNode` |  | Prose 和 `Citation` 标记在段落内呈现。 |
| `className` | `string` |  | 合并到该段落中。 |

其余 `p` 属性会传给根元素。

### 引用 {#citation}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------------- | -------- | ---------------------------------------------------------------------------- |
| `index` | `number` |  | 从零开始的源位置。标记显示该值加一。 |
| `source` | `Source` |  | 预览和可访问标记名称的内容。 |
| `open` | `boolean` |  | 控制是否打开此预览。对于悬停和焦点行为，请忽略它。 |
| `onOpenChange` | `(open: boolean) => void` |  | 接收预览状态更改。 |
| `className` | `string` |  | 合并到标记按钮上。 |

其他按钮属性，例如 `data-*`、`disabled` 和 `onClick`，将转发到标记按钮。不接受 `aria-label`、`children` 和 `type`。

### 来源 {#source}

| 字段 | 类型 | 说明 |
| ------------- | -------- | ------------------------------------------------------ |
| `title` | `string` | 预览中显示的源标题和标记名称。 |
| `snippet` | `string` | 标题下方显示的支持文字。 |
| `domain` | `string` | 域标签。省略时，使用 `url` 的主机。 |
| `url` | `string` | 安全 URL 添加 `Open source` 链接。 |
| `publishedAt` | `string` | 显示为月份和年份的可解析日期。 |
