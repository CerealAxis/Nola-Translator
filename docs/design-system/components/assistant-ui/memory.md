---
title: Memory（记忆）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Memory（记忆）

显示本轮保存的记忆，并允许用户移除记录。

MemoryChips 列出了助手现在记住的有关你的内容：每颗胶囊形标签，新写的有色胶囊形标签，每个胶囊形标签都有自己的忘记按钮。在运行时，胶囊形标签来自当前轮次中进行的 `remember` 工具调用。独立的你拥有整个列表。

<demo react="assistant-ui/memory-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-memory-chips"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-memory-chips.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui 没有内置内存概念：消息中没有任何内容跟踪了解的有关用户的事实。最接近的真实构建块是工具调用，就像分级声明或比较表一样。为模型提供一个 `remember` 工具，并将其在当前消息中进行的每个调用收集到标签列表中。

### 从消息中读取 remember 工具调用 {#read-remember-calls-off-the-message}

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";
import type { ToolCallMessagePart } from "@assistant-ui/react";
import {
  MemoryChips,
  type MemoryChip,
} from "@/components/assistant-ui/elements/memory-chips";

type RememberCall = ToolCallMessagePart<
  { text: string; change: "added" | "updated" },
  void
>;

function MemoryFromMessage() {
  const chips = useAuiState((s): MemoryChip[] =>
    s.message.role === "assistant"
      ? s.message.content
          .filter(
            (part): part is RememberCall =>
              part.type === "tool-call" && part.toolName === "remember",
          )
          .map((part) => ({
            id: part.toolCallId,
            text: part.args.text,
            change: part.args.change,
          }))
      : [],
  );

  if (chips.length === 0) return null;
  return <MemoryChips chips={chips} onForget={forgetMemory} />;
}
```

   `remember` 及其 `{ text, change }` args 是你自己的工具合约。`part.args` 是真正的类型化管道，它携带模型在调用流时写回客户端的所有内容。

### 注册工具 {#register-the-tool}

   标签列表已在上述步骤中呈现，并在每次调用中聚合，因此该工具自己的 `render` 没有任何内容可显示并返回 `null`。

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";

export const toolkit = defineToolkit({
  remember: {
    type: "frontend",
    description: "保存有关用户的事实以供将来使用。",
    parameters: z.object({
      text: z.string(),
      change: z.enum(["added", "updated"]),
    }),
    execute: async ({ text, change }) => {
      await saveMemory({ text, change });
    },
    render: () => null,
  },
});
```

   将工具包与运行时配置上的 `Tools({ toolkit })` 连接起来，与任何其他工具包相同。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

在独立版中，你拥有整个筹码列表，包括本轮次之前它记住的任何内容。

### 维护记忆标签列表 {#hold-the-chip-list}

```tsx
"use client";

import { useState } from "react";
import {
  MemoryChips,
  type MemoryChip,
} from "@/components/assistant-ui/elements/memory-chips";

const INITIAL: MemoryChip[] = [
  { id: "1", text: "更喜欢 TypeScript", change: "existing" },
  { id: "2", text: "适用于 Assistant-ui", change: "existing" },
];

export function Memory() {
  const [chips, setChips] = useState(INITIAL);
  return (
    <MemoryChips
      chips={chips}
      onForget={(id) => setChips((c) => c.filter((chip) => chip.id !== id))}
    />
  );
}
```

### 标记新增记忆 {#mark-a-memory-fresh}

   附加带有 `change: "added"` 或 `"updated"` 的标签即可将标头从 `memory` 变为 `remembered N`。见解剖学。

```tsx
setChips((c) => [
  ...c,
  { id: crypto.randomUUID(), text: "周五发货", change: "added" },
]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="memory-chips">
  <div>
    <svg aria-hidden />{/* brain icon */}
    <span>{/* "memory" or "remembered N" */}</span>
  </div>
  <div>
    <span>
      {/* one pill per chip */}
      <button aria-label={/* Forget "..." */} />
    </span>
  </div>
</div>
```

头读取 `memory`，直到至少有一个标签的 `change` 为 `"added"` 或 `"updated"`，然后切换到 `remembered N`，其中 N 只计算非 `existing` 标签。颜色标记两种状态，而不是三种：`existing` 标签使用中性 `field` 表面，而 `added` 和 `updated` 标签共享相同的蓝色色调，因此调用者无法仅通过颜色区分这两种状态。每个胶囊形标签在 `chip.id` 上按键并以 300 毫秒的淡入淡出和缩放安装，因此附加新标签只会为该胶囊形标签注入动画。屏幕上已有的标签会保留其 DOM 节点并且不会重播。空的 `chips` 数组单独渲染标题，读取 `memory`，没有占位符丸。

## 示例 {#examples}

### 合并本轮次之前的记忆 {#merge-in-memories-from-before-this-turn}

**运行时版**

`s.message.content` 只保存该消息中发生的事情。三轮次前记住的事实没有工具调用部分可供阅读。将你自己的持久列表合并到上面选择器中的新列表之前：

 标签上的

```tsx
const chips = [...existingMemories, ...freshChipsFromMessage];
```

已有记忆（`existing`）的 `onForget` 应直接调用应用的删除接口。当前消息没有可更新的工具调用，因此还要从本地状态移除这一项，才能立即隐藏标签。

**独立版**

相同的合并在这里更简单：将持久列表与最后一轮添加的任何内容连接起来，然后将结果传递给 `chips`。

### 调整记忆标签样式 {#restyle-the-chips}

两种用法都支持通过 `className` 调整根元素。标头标签读取共享的 `mono` 标记、`field` 的 `existing` 胶囊形标签以及 `ghostButton` 的忘记按钮，所有这些都在 `surfaces.tsx` 中。

```tsx
<MemoryChips className="gap-3" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/字段 | 类型 | 说明 |
| -------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.message.content` | `readonly ThreadAssistantMessagePart[]` | 在此搜索 `tool-call` 且 `toolName` 与你的记忆工具相匹配的片段。assistant-ui没有内置内存字段。 |
| `ToolCallMessagePart.args` | `TArgs` | 该调用的模型参数，由你提供的 `ToolCallMessagePart<TArgs, TResult>` 泛型键入。调用仍在进行时部分播放。 |
| `ToolCallMessagePart.toolCallId` | `string` | 稳定的调用ID。自然的 `MemoryChip.id`。 |

**独立版**

### MemoryChips {#memorychips}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `chips` | `readonly MemoryChip[]` |  | 要渲染的胶囊形标签，按顺序排列。 |
| `onForget` | `(id: string) => void` |  | 当按下忘记按钮时，使用标签的 `id` 进行调用。忘记按钮仅在提供时呈现。 |
| `className` | `string` |  | 合并到根元素。 |

### MemoryChip {#memorychip}

| 字段 | 类型 | 说明 |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `id` | `string` |  |
| `text` | `string` |  |
| `change` | `"added" \| "updated" \| "existing"` | `existing`呈现中性。`added` 和 `updated` 具有相同的突出显示外观。 |

其余 `div` 属性会传给根元素。
