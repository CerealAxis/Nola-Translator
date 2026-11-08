---
title: Tool timeline（工具时间线）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Tool timeline（工具时间线）

按时间列出工具操作、目标和文件变更统计。

工具时间线将一个助手所做的所有事情变成一条折叠线，展开为一条垂直轨迹：一个动词、一个图标和每一步的一个筹码，以一行文件更改统计信息结束。通过运行时，你可以从消息本身的部分导出步骤。在独立版中，你自己保存步骤列表。

对于交替评论和工具、持续运行计时以及不公开的答案，请使用 [运行活动](./run-activity)。

<demo react="assistant-ui/tool-timeline-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-tool-timeline"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-tool-timeline.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

单个工具调用通过该工具自己的 `render` 字段进行渲染，但时间线会立即汇总消息中的每个调用，因此它直接读取 `s.message.parts`，而不是注册为一个工具的渲染器。

### 从消息片段提取步骤 {#derive-steps-from-the-messages-parts}

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  FileSearchIcon,
  PenLineIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import { useAuiState, type ToolCallMessagePart } from "@assistant-ui/react";
import {
  ToolTimeline,
  type TimelineStat,
  type TimelineStep,
} from "@/components/assistant-ui/elements/tool-timeline";

const TOOL_META: Record<string, { verb: string; icon: LucideIcon }> = {
  read_file: { verb: "Read", icon: FileSearchIcon },
  run_command: { verb: "Ran", icon: TerminalIcon },
  edit_file: { verb: "Edited", icon: PenLineIcon },
};

function toStep(part: ToolCallMessagePart): TimelineStep {
  const meta = TOOL_META[part.toolName];
  const args = part.args as Record<string, unknown>;
  return {
    verb: meta?.verb ?? part.toolName,
    chip: String(args.path ?? args.command ?? part.toolCallId),
    icon: meta?.icon ?? TerminalIcon,
  };
}

function toStats(parts: readonly ToolCallMessagePart[]): TimelineStat[] {
  return parts
    .filter((part) => part.toolName === "edit_file" && part.result)
    .map((part) => {
      const result = part.result as { file: string; added: number; removed: number };
      return { file: result.file, added: result.added, removed: result.removed };
    });
}

export function SessionTimeline() {
  const [open, setOpen] = useState(false);
  const parts = useAuiState((s) => s.message.parts);
  const toolCalls = useMemo(
    () =>
      parts.filter(
        (part): part is ToolCallMessagePart => part.type === "tool-call",
      ),
    [parts],
  );
  const streaming = useAuiState((s) => s.message.status?.type === "running");
  const steps = toolCalls.map(toStep);
  const stats = toStats(toolCalls);

  if (steps.length === 0) return null;

  return (
    <ToolTimeline
      steps={steps}
      visibleSteps={steps.length}
      streaming={streaming}
      open={open}
      onOpenChange={setOpen}
      restingLabel={`${steps.length} steps · ${stats.length} files changed`}
      activeLabel="Working"
      stats={stats}
    />
  );
}
```

### 在消息片段旁放置时间线 {#place-it-beside-the-message-parts-not-inside-them}

   `SessionTimeline` 替换了工具调用和推理的每部分渲染，因此请静音 `MessagePrimitive.Parts` 中的那些，以避免两次显示相同的步骤：

```tsx
<MessagePrimitive.Root>
  <SessionTimeline />
  <MessagePrimitive.Parts
    components={{ tools: { Fallback: () => null }, Reasoning: () => null }}
  />
</MessagePrimitive.Root>
```

**独立版**

在独立版中，你将步骤和统计数组保存为状态，并随着工作的发生而增长它们。

### 持有步骤列表 {#hold-the-step-list}

```tsx
"use client";

import { useState } from "react";
import { FileSearchIcon, PenLineIcon, TerminalIcon } from "lucide-react";
import {
  ToolTimeline,
  type TimelineStat,
  type TimelineStep,
} from "@/components/assistant-ui/elements/tool-timeline";

const STEPS: TimelineStep[] = [
  { verb: "Read", chip: "thread.tsx", icon: FileSearchIcon },
  { verb: "Ran", chip: "pnpm vitest", icon: TerminalIcon },
  { verb: "Edited", chip: "composer.tsx", icon: PenLineIcon },
];

const STATS: TimelineStat[] = [{ file: "composer.tsx", added: 14, removed: 3 }];

export function Session() {
  const [open, setOpen] = useState(false);

  return (
    <ToolTimeline
      steps={STEPS}
      visibleSteps={STEPS.length}
      streaming={false}
      open={open}
      onOpenChange={setOpen}
      restingLabel="3 steps · 1 file changed"
      activeLabel="Working"
      stats={STATS}
    />
  );
}
```

### 随任务推进显示步骤 {#reveal-steps-as-work-happens}

   `visibleSteps` 与数组长度无关，因此在显示之前 `steps` 中可以存在一个步骤：

```tsx
const [visibleSteps, setVisibleSteps] = useState(0);

useEffect(() => {
  if (visibleSteps >= STEPS.length) return;
  const id = setTimeout(() => setVisibleSteps((n) => n + 1), 1000);
  return () => clearTimeout(id);
}, [visibleSteps]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="tool-timeline">
  <button>{/* chevron, shimmering activeLabel while streaming, else restingLabel */}</button>
  <div>
    {/* one row per visible step: icon, verb, chip */}
    {/* a wrapped row of file chips, only when stats.length > 0 */}
  </div>
</div>
```

`visibleSteps` 被保留并钳位到 `0…steps.length` 中，因此步骤可以在显示之前排队。只有最后一个可见的步骤才会闪烁，并且只有当 `streaming` 为 true 时。即使在运行过程中，每一个早期步骤都被视为已解决。当 `stats` 为空时，统计数据行将被完全省略，而缺少 `added` 或 `removed` 的统计数据将省略该计数的一半，而不是将其显示为零。携带相同 `chip` 的两个步骤仍呈现为单独的行。

## 示例 {#examples}

### 调整时间线 {#restyle-the-timeline}

两种用法都支持通过 `className` 调整根元素。行、标签和闪烁的标签都是从 `surfaces.tsx` 中的共享标记中读取的。

```tsx
<ToolTimeline className="max-w-none" /* ... */ />
```

### 只显示最近的步骤 {#showing-only-the-recent-tail}

该面板显示了从阵列开始的步骤，因此请限制阵列本身，而不仅仅是 `visibleSteps`，以仅显示长期运行的最新步骤：

```tsx
const steps = toolCalls.map((part) => ({
  ...toStep(part),
  id: part.toolCallId,
}));
<ToolTimeline steps={steps.slice(-6)} visibleSteps={6} /* ... */ />
```

当窗口可以滑动时，给每一步一个稳定的`id`。幸存的步骤保留其行，新进入的步骤安装可以运行其进入动画的行。

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `s.message.parts` | `readonly ThreadAssistantMessagePart[]` | 消息中的每个部分。过滤 `part.type === "tool-call"` 以构建步骤列表。 |
| `s.message.status` | `MessageStatus \| undefined` | `status?.type === "running"`，而消息仍在流式传输。 |

没有专用的时间线基础组件：您自己编写从 `parts` 到 `steps` 和 `stats` 的映射，就像上面 `toStep` 和 `toStats` 所做的那样。有关完整的 `ToolCallMessagePart` 形状，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### ToolTimeline {#tooltimeline}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------------- | -------- | ---------------------------------------------------------------------- |
| `steps` | `readonly TimelineStep[]` |  | 完整步骤列表（按顺序）。 |
| `steps[].id` | `string` |  | 步骤的稳定身份。没有 ID 的行使用它们的索引。 |
| `visibleSteps` | `number` |  | 从`steps`开始到渲染需要多少步。 |
| `streaming` | `boolean` |  | 如果为 true，则使触发器标签和最后一个可见步骤闪烁。 |
| `open` | `boolean` |  | 显示面板是否展开。 |
| `onOpenChange` | `(open: boolean) => void` |  | 单击触发器时调用。 |
| `restingLabel` | `string` |  | 一旦 `streaming` 为 false，就会显示触发文本。 |
| `activeLabel` | `string` |  | 当 `streaming` 为真时显示闪烁的触发文本。 |
| `stats` | `TimelineStat[]` |  | 文件更改标签如下图所示。传递 `[]` 以省略该行。 |
| `className` | `string` |  | 合并到根元素。 |

`TimelineStep` 是 `{ id?: string; verb: string; chip: string; icon: LucideIcon }`。 `TimelineStat` 是 `{ file: string; added?: number; removed?: number }`。
