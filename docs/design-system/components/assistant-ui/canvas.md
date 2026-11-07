---
title: Canvas（画布）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Canvas（画布）

将聊天和可查看的文档并列展示，支持复制和关闭。

<demo react="assistant-ui/canvas-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-canvas-split"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-canvas-split.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 从工具调用渲染文档

从工具调用的参数或结果读取文档，把生成状态和正文传入文档区。

```tsx
"use client";

import { MessagePrimitive, useToolArgsStatus, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { CanvasSplitDocument, CanvasSplitHeader, CanvasSplitBody, CanvasSplitLine } from "./canvas-split";

type DocArgs = { title: string; content: string };

function DocumentTool({ args, status }: ToolCallMessagePartProps<DocArgs>) {
  const { propStatus } = useToolArgsStatus<DocArgs>();
  return (
    <CanvasSplitDocument>
      <CanvasSplitHeader
        title={args.title ?? "未命名"}
        version={1}
        saved={status.type === "complete"}
      />
      <CanvasSplitBody writing={propStatus.content === "streaming"}>
        <CanvasSplitLine>{args.content}</CanvasSplitLine>
      </CanvasSplitBody>
    </CanvasSplitDocument>
  );
}

<MessagePrimitive.Parts components={{ tools: { by_name: { write_document: DocumentTool } } }} />
```

### 为会话保留一栏

将 Thread 的视口留在单独一栏，工具选择或生成的文档在旁边展示。

```tsx
<CanvasSplit>
  <ThreadPrimitive.Viewport asChild>
    <CanvasSplitThread>
      <ThreadPrimitive.Messages>
        {({ message }) => (
          <CanvasSplitMessage speaker={message.role === "user" ? "user" : "assistant"}>
            <MessagePrimitive.Parts components={{ tools: { by_name: { write_document: DocumentTool } } }} />
          </CanvasSplitMessage>
        )}
      </ThreadPrimitive.Messages>
    </CanvasSplitThread>
  </ThreadPrimitive.Viewport>
  {/* 对应槽位内容 */}
</CanvasSplit>
```

**独立使用**

### 布置两侧内容

使用 `CanvasSplit` 和相关子组件布局聊天与文档。

```tsx
"use client";

import {
  CanvasSplit,
  CanvasSplitThread,
  CanvasSplitMessage,
  CanvasSplitDocument,
  CanvasSplitHeader,
  CanvasSplitBody,
  CanvasSplitLine,
} from "@/components/assistant-ui/elements/canvas-split";

export function Canvas() {
  return (
    <CanvasSplit>
      <CanvasSplitThread>
        <CanvasSplitMessage speaker="user">起草项目提纲。</CanvasSplitMessage>
        <CanvasSplitMessage speaker="assistant">右侧是初稿。</CanvasSplitMessage>
      </CanvasSplitThread>
      <CanvasSplitDocument>
        <CanvasSplitHeader title="项目提纲" version={1} saved onCopy={() => {}} onClose={() => {}} />
        <CanvasSplitBody>
          <CanvasSplitLine heading>目标</CanvasSplitLine>
          <CanvasSplitLine>在周五前交付首个里程碑。</CanvasSplitLine>
        </CanvasSplitBody>
      </CanvasSplitDocument>
    </CanvasSplit>
  );
}
```

### 显示正在生成的文档

文档仍在生成时增量更新正文，并切换对应状态。

```tsx
<CanvasSplitBody writing={isGenerating}>
  {lines.map((line, i) => (
    <CanvasSplitLine key={i} heading={line.heading}>{line.text}</CanvasSplitLine>
  ))}
</CanvasSplitBody>
```

## 结构 {#anatomy}

一侧承载会话，另一侧包含文档标题、正文及操作。

```tsx
<div data-slot="canvas-split">
  <div data-slot="canvas-split-thread">{/* 对应槽位内容 */}</div>
  <div data-slot="canvas-split-document">
    <div data-slot="canvas-split-header">{/* 显示名称或标题 */}</div>
    <div data-slot="canvas-split-body">{/* 对应槽位内容 */}</div>
  </div>
</div>
```

布局以组件自身的宽度为依据，达到 36rem 时并排排列，更窄时上下排列。分别提供 `onCopy` 和 `onClose` 才会启用对应操作。

## 示例 {#examples}

### 复制与关闭

将复制回调连接到当前文档正文，将关闭回调连到应用的面板状态。

```tsx
<CanvasSplitHeader
  title="第三季度报告提纲"
  version={3}
  saved={true}
  onCopy={() => navigator.clipboard.writeText(text)}
  onClose={() => setOpen(false)}
/>
```

### 脱离工具调用显示文档

直接由应用提供文档内容，例如从列表打开已经生成的文件。

## API 参考 {#api-reference}

**使用运行时**

### 基础组件

| 组成部分 | Renders | 说明 |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `MessagePrimitive.Parts` | children | 遍历消息片段并渲染内容或工具 UI。 |
| `ThreadPrimitive.Viewport` / `.Messages` | `div` / children | 提供会话视口并渲染消息列表。 |

### 工具调用片段

| 字段 | 类型 | 说明 |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `args` | `TArgs` (partial while streaming) | 工具调用参数。流式调用尚未结束时，内容可能只解析了一部分。 |
| `status.type` | `"running" \| "requires-action" \| "complete" \| "incomplete"` | 当前状态的类型，决定界面所显示的阶段。 |
| `useToolArgsStatus().propStatus` | `Partial<Record<keyof TArgs, "streaming" \| "complete">>` | 在渲染器中读取各工具参数的流式生成状态。 |

**独立使用**

### CanvasSplit family

| 组成部分 | Renders | Props | 说明 |
| --------------------- | ------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CanvasSplit` | `div` | `className` | 会话与文档的分栏布局。 |
| `CanvasSplitThread` | `div` | `className` | 容纳会话的一栏。 |
| `CanvasSplitMessage` | `div` | `speaker: "user" \| "assistant"`, `className` | 一条会话消息。 |
| `CanvasSplitDocument` | `div` | `className` | 容纳文档的一栏。 |
| `CanvasSplitHeader` | `div` | `title: string`, `version: number`, `saved: boolean`, `onCopy?`, `onClose?`, `className` | 文档标题与操作区。 |
| `CanvasSplitBody` | `div` | `writing?: boolean`, `className` | 文档正文区。 |
| `CanvasSplitLine` | `p` | `heading?: boolean`, `className` | 正文中的一行。 |

各部分会将其余属性转发给自身的根元素。
