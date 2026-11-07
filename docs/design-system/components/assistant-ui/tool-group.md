---
title: Tool group（工具分组）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Tool group（工具分组）

把连续的工具调用收纳在一个可展开的组里，并显示数量和运行状态。

<demo react="assistant-ui/tool-group-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/tool-group"
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

## 快速开始 {#getting-started}

默认对话可自动组合相邻工具调用，也可在消息渲染器中定义分组。

### 使用默认分组 {#its-already-the-default}

消息通过 `MessagePrimitive.GroupedParts` 和 `groupPartByType` 将相邻的工具调用组合起来。

```tsx
import { groupPartByType, MessagePrimitive } from "@assistant-ui/react";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/elements/tool-group.aui";

<MessagePrimitive.GroupedParts
  groupBy={groupPartByType({
    "tool-call": ["group-tool"],
  })}
>
  {({ part, children }) => {
    switch (part.type) {
      case "group-tool":
        return (
          <ToolGroupRoot variant="ghost">
            <ToolGroupTrigger
              count={part.indices.length}
              active={part.status.type === "running"}
            />
            <ToolGroupContent>{children}</ToolGroupContent>
          </ToolGroupRoot>
        );
      // ...other cases
    }
  }}
</MessagePrimitive.GroupedParts>
```

### 替换所有工具组 {#override-it-for-every-group}

在 `Thread` 的 `components.ToolGroup` 中传入自己的组，使用 `group.indices` 计算数量、用 `group.status` 判断状态。

```tsx
<Thread
  components={{
    ToolGroup: ({ group, children }) => (
      <MyToolGroup running={group.status.type === "running"} count={group.indices.length}>
        {children}
      </MyToolGroup>
    ),
  }}
/>
```

## 结构 {#anatomy}

折叠触发器显示数量，运行中可显示加载指示。展开内容区按顺序呈现组内调用。

```tsx
<div data-slot="tool-group-root" data-variant="outline">
  <button data-slot="tool-group-trigger" aria-expanded={/* open */}>
    {/* spinner, only while active */}
    <span data-slot="tool-group-trigger-label">{/* "3 tool calls" / "1 tool call" */}</span>
    {/* chevron, rotates open */}
  </button>
  <div data-slot="tool-group-content">
    {/* each tool call, revealed with a staggered fade/slide */}
  </div>
</div>
```

## 示例 {#examples}

可以选择外观，也可以由父组件控制开关。

### 变体 {#variants}

`variant` 支持 `outline`、`ghost` 和 `muted`。

```tsx
<ToolGroupRoot variant="outline">{/* ... */}</ToolGroupRoot>
<ToolGroupRoot variant="ghost">{/* ... */}</ToolGroupRoot>
<ToolGroupRoot variant="muted">{/* ... */}</ToolGroupRoot>
```

### 受控展开状态 {#controlled-open-state}

同时传入 `open` 与 `onOpenChange`。只需设置初始状态时使用 `defaultOpen`。

```tsx
<ToolGroupRoot open={expanded} onOpenChange={setExpanded}>
  {/* ... */}
</ToolGroupRoot>
```

## API 参考 {#api-reference}

组件既能作为运行时的组渲染器，也能独立组合。

### 组件部分 {#parts}

`ToolGroupRoot` 包裹组，`ToolGroupTrigger` 展示摘要，`ToolGroupContent` 容纳每次工具调用。

### ToolGroupRoot 属性 {#toolgrouproot-props}

设置 `variant`、展开状态、变化回调与类名。

### ToolGroupTrigger 属性 {#toolgrouptrigger-props}

`count` 传入工具调用数，`active` 表示当前有工具运行。

### 组合 {#composition}

用 `part.indices.length` 和 `part.status.type` 填充触发器，将分组渲染器的 `children` 放进内容区。

## 并行工具设计 {#the-parallel-tools-design}

独立版本将一批工具的执行状态汇总到同一个折叠区域。

```sh
npx shadcn@latest add "@assistant-ui/elements-tool-group"
```

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAuiState, type ToolCallMessagePart } from "@assistant-ui/react";
import {
  ToolGroup,
  type GroupedTool,
} from "@/components/assistant-ui/elements/tool-group";

function toGroupedTool(part: ToolCallMessagePart): GroupedTool {
  const args = part.args as Record<string, unknown>;
  const state =
    part.status.type === "running"
      ? "running"
      : part.status.type === "complete"
        ? "done"
        : "failed";
  return {
    id: part.toolCallId,
    name: part.toolName,
    target: String(args.path ?? args.command ?? part.toolCallId),
    state,
    durationMs:
      part.timing && part.timing.completedAt
        ? part.timing.completedAt - part.timing.startedAt
        : undefined,
  };
}

function AssistantToolGroup() {
  const parts = useAuiState((s) => s.message.parts);
  const tools = useMemo(
    () =>
      parts.flatMap((part) =>
        part.type === "tool-call" ? [toGroupedTool(part)] : [],
      ),
    [parts],
  );
  const [open, setOpen] = useState(false);

  if (tools.length === 0) return null;

  return (
    <ToolGroup
      label={tools.length === 1 ? "1 tool call" : `${tools.length} tool calls`}
      tools={tools}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
```

```tsx
"use client";

import { useState } from "react";
import { ToolGroup, type GroupedTool } from "@/components/assistant-ui/elements/tool-group";

const initialCalls: GroupedTool[] = [
  { id: "1", name: "read_file", target: "src/index.ts", state: "done", durationMs: 120 },
  { id: "2", name: "read_file", target: "src/utils.ts", state: "running" },
];

export function Turn() {
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState(initialCalls);
  return (
    <ToolGroup label="2 tool calls" tools={tools} open={open} onOpenChange={setOpen} />
  );
}
```

### ToolGroup {#toolgroup}

传入组内调用与当前状态，可按需要管理组的展开。

### GroupedTool {#groupedtool}

表示一项工具调用及其可读名称、状态和结果。
