---
title: Speaker identity（发言者身份）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Speaker identity（发言者身份）

区分会话中的用户、助手和不同模型。

每轮发言者身份行都带有一个图标和音调，表明是谁或什么产生了它：你、助手、子代理或工具。在运行时中，用户、助手和工具的区别直接来自消息和片段数据。独立的你自己组装列表。

<demo react="assistant-ui/speaker-identity-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-speaker-identity"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-speaker-identity.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`s.message.role` 直接为你提供用户/助手拆分。工具调用作为助手消息的 `content` 内部的一部分进行实时调用，每个调用都有一个 `toolName`，并且当运行时跟踪它时，还会有一个 `timing`。嵌套子代理运行显示为工具调用自己的 `messages` 字段，对于这种情况，它是 `ToolCallMessagePart` 的实际部分。 assistant-ui 没有固定的“代理名称”概念，除此之外：特定代理或模型的显示名称是你通过消息的开放 `metadata.custom` 包附加的内容。

### 将顶级消息变成一行 {#turn-a-top-level-message-into-a-row}

```tsx
"use client";

import type { ThreadMessage } from "@assistant-ui/react";
import type { SpeakerTurn } from "@/components/assistant-ui/elements/speaker-identity";

function textOf(content: readonly { type: string; text?: string }[]) {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

function customString(message: ThreadMessage, key: string): string | undefined {
  const value = message.metadata.custom[key];
  return typeof value === "string" ? value : undefined;
}

function messageTurn(message: ThreadMessage): SpeakerTurn {
  if (message.role === "user") {
    return { id: message.id, kind: "user", name: "你\n\n上面的", text: textOf(message.content) };
  }
  return {
    id: message.id,
    kind: "agent",
    name: customString(message, "agentName") ?? "Assistant",
    detail: customString(message, "model"),
    text: textOf(message.content),
  };
}
```

   `agentName` 和 `model` 是示例约定，不是内置字段。你自己的多代理后端决定它在 `metadata.custom` 中存储什么以及在哪些键下存储。

### 添加工具调用和嵌套子代理 {#add-tool-calls-and-nested-subagents}

```tsx
import type { ToolCallMessagePart } from "@assistant-ui/react";

function toolTurn(part: ToolCallMessagePart): SpeakerTurn {
  const ms =
    part.timing?.completedAt !== undefined
      ? part.timing.completedAt - part.timing.startedAt
      : undefined;
  return {
    id: part.toolCallId,
    kind: "tool",
    name: part.toolName,
    detail: ms !== undefined ? `${ms}ms` : undefined,
    text: part.argsText,
  };
}

function turnsFor(message: ThreadMessage): SpeakerTurn[] {
  const turns = [messageTurn(message)];
  if (message.role !== "assistant") return turns;

  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    turns.push(toolTurn(part));
    for (const sub of part.messages ?? []) {
      turns.push({ ...messageTurn(sub), kind: "subagent" });
    }
  }
  return turns;
}
```

   哪个参数值得显示，因为工具行的 `text` 是特定于工具的。`argsText`（原始流式 JSON）是一种安全的通用回退，但当你打开 `toolName` 时，`read_file` 工具的路径或 `search` 工具的查询通常更具可读性。

**独立版**

独立，SpeakerIdentity 采用扁平列表轮流。你可以决定什么算作一个轮次以及如何排序。

### 构建对话轮次列表 {#build-the-turn-list}

```tsx
import { SpeakerIdentity, type SpeakerTurn } from "@/components/assistant-ui/elements/speaker-identity";

const TURNS: SpeakerTurn[] = [
  { id: "1", kind: "user", name: "你\n\n上面的", text: "找出转换器匝数下降的原因。" },
  { id: "2", kind: "agent", name: "维护者", detail: "作品", text: "把这个分开。" },
  { id: "3", kind: "subagent", name: "reader", detail: "俳句", text: "ConvertMessages 提前返回。" },
];

<SpeakerIdentity turns={TURNS} />;
```

### 随着会话的进行而附加 {#append-as-the-session-progresses}

```tsx
setTurns((prev) => [...prev, { id: crypto.randomUUID(), kind: "tool", name: "read_file", text: path }]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="speaker-identity">
  {/* per turn: an icon in a tinted badge, then a name/detail line and the text below it */}
</div>
```

每个 `kind` 都映射到一个固定的图标和色调：`user` 和 `subagent` 共享中性色调，`agent` 是唯一一个蓝色的，`tool` 是四个中最暗的。 `subagent` 是一种其徽章呈现为整圆而不是圆角正方形的类型，这反映出它代表整个嵌套对话而不是单个发言者。

## 示例 {#examples}

### 调整徽章 {#restyle-the-badges}

两种用法都支持通过 `className` 调整根元素。 `detail`从`surfaces.tsx`读取共享的`mono`表面。

```tsx
<SpeakerIdentity className="gap-4" turns={turns} />
```

### 只有一位发言者的会话 {#a-thread-with-only-one-voice}

**运行时版**

大多数会话从不产生 `subagent` 或 `tool` 行。上面的 `turnsFor` 仍然为它们返回一个简单的两种列表（`user`，`agent`），因为 `content` 上的循环找不到任何可添加的内容。

**独立版**

单个 `kind` 的传递轮次与混合列表的工作方式相同。图标和音调是按行查找的，而不是为整个列表选择一次。

```tsx
<SpeakerIdentity turns={turns.filter((t) => t.kind === "user" || t.kind === "agent")} />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/字段 | 类型 | 说明 |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `s.message.role` | `"user" \| "assistant" \| "system"` | 真正的分体。`"agent"` 和 `"subagent"` 是该组件自己的词汇表，而不是运行时角色。 |
| `s.message.metadata.custom` | `Record<string, unknown>` | 打开包，用于存放应用程序定义的显示数据，例如代理的姓名或型号。 |
| `ToolCallMessagePart.toolName` | `string` | 被调用工具的名称。 |
| `ToolCallMessagePart.timing` | `{ startedAt: number; completedAt?: number } \| undefined` | 纪元女士。一旦 `completedAt` 设置，就减去一段时间。 |
| `ToolCallMessagePart.messages` | `readonly ThreadMessage[] \| undefined` | 此调用生成的嵌套会话消息，例如子代理自己的对话。 |

**独立版**

### SpeakerIdentity {#speakeridentity}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------------ | -------- | --------------------------------- |
| `turns` | `readonly SpeakerTurn[]` |  | 要渲染的完整有序列表。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。

### SpeakerTurn {#speakerturn}

| 字段 | 类型 | 说明 |
| -------- | ------------------------------------------- | ------------------------------------------------------- |
| `id` | `string` |  |
| `kind` | `"user" \| "agent" \| "subagent" \| "tool"` | 驱动图标和音调。 |
| `name` | `string` |  |
| `detail` | `string \| undefined` | 显示在名称旁边，例如模型名称或持续时间。 |
| `text` | `string` |  |
