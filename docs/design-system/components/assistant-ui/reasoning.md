---
title: Reasoning（推理）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Reasoning（推理）

将模型推理放入可展开区域，流式传输时可继续显示进度。

<demo react="assistant-ui/reasoning-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/reasoning"
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

在消息中把连续推理片段组成一组，再分别渲染折叠区域和每段内容。

### 分组并组合折叠区域 {#group-reasoning-parts-and-compose-the-disclosure}

用 `MessagePrimitive.GroupedParts` 与 `groupPartByType` 分组，通过推理组的 `children` 渲染实际片段。

```tsx
import { MessagePrimitive, groupPartByType } from "@assistant-ui/react";
import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning.aui";

<MessagePrimitive.GroupedParts
  groupBy={groupPartByType({ reasoning: ["group-reasoning"] })}
>
  {({ part, children }) => {
    if (part.type !== "group-reasoning") return null;
    const running = part.status.type === "running";
    return (
      <ReasoningRoot streaming={running}>
        <ReasoningTrigger active={running} />
        <ReasoningContent aria-busy={running}>
          <ReasoningText>{children}</ReasoningText>
        </ReasoningContent>
      </ReasoningRoot>
    );
  }}
</MessagePrimitive.GroupedParts>
```

### 渲染每段推理 {#render-each-reasoning-part}

在消息的片段渲染器中将 `Reasoning` 绑定到推理类型，保留运行时提供的文本和流式状态。

```tsx
case "reasoning":
  return <Reasoning {...part} />;
```

### 组合折叠区域 {#compose-the-disclosure}

把 `ReasoningTrigger` 和 `ReasoningContent` 放进 `ReasoningRoot`；`ReasoningText` 和 `ReasoningFade` 可以组合到内容区。

```tsx
"use client";

import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning";

export function Trace({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <ReasoningRoot streaming={streaming}>
      <ReasoningTrigger active={streaming} />
      <ReasoningContent aria-busy={streaming}>
        <ReasoningText>{text}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
}
```

### 控制展开状态 {#control-the-open-state}

默认展开用 `defaultOpen`，由外部控制时同时传入 `open` 和 `onOpenChange`。

```tsx
const [open, setOpen] = useState(false);

<ReasoningRoot open={open} onOpenChange={setOpen} streaming={streaming}>
  {/* ... */}
</ReasoningRoot>;
```

## 结构 {#anatomy}

触发区显示状态或持续时间，折叠内容放置推理片段；末尾可加渐隐以提示还有内容。

```tsx
<div data-slot="reasoning-root" data-variant="outline">
  <button data-slot="reasoning-trigger">
    <BrainIcon />
    <span>{/* "Reasoning" or "Reasoning (12s)" */}</span>
    <ChevronDownIcon />
  </button>
  <div data-slot="reasoning-content">
    <div data-slot="reasoning-fade" /> {/* top edge, always */}
    <div data-slot="reasoning-text">{/* the trace */}</div>
    <div data-slot="reasoning-fade" /> {/* bottom edge, streaming only */}
  </div>
</div>
```

## 示例 {#examples}

根据消息布局调整披露容器外观和触发区信息。

### 变体 {#variants}

选择 `ReasoningRoot` 的 `variant`，让折叠面板与消息内容的视觉层级一致。

```tsx
<ReasoningRoot variant="muted" streaming={streaming}>
  {/* ... */}
</ReasoningRoot>
```

### 触发区的用时 {#trigger-duration}

`ReasoningTrigger` 可以显示推理持续时间，组处于运行状态时显示进行中。

```tsx
<ReasoningTrigger active={streaming} duration={12} />
// renders: Reasoning (12s)
```

### 推理片段从哪里来 {#where-reasoning-parts-come-from}

模型和传输层需要返回 `reasoning` 片段，消息运行时才能将它们交给对应渲染器。

```tsx
const running = part.status.type === "running";
const timing = part.timing;
<ReasoningTrigger
  active={running}
  duration={
    timing?.completedAt === undefined
      ? undefined
      : Math.round((timing.completedAt - timing.startedAt) / 1000)
  }
/>
```

## API 参考 {#api-reference}

推理渲染器和披露组件都可单独替换。

### Reasoning {#reasoning}

适用于 `MessagePrimitive` 推理片段的预设渲染器。

### 推理消息片段 {#reasoning-message-part}

片段类型为 `reasoning`，提供 `text` 和当前片段状态。

### 子组件 {#sub-components}

使用折叠根节点、触发器、内容区和文字节点组合外观。

### ReasoningRoot {#reasoningroot}

管理折叠状态和外观，接受 `open`、`defaultOpen`、`onOpenChange`。

### ReasoningTrigger {#reasoningtrigger}

负责展开与收起，接收推理进度和用时以更新标签。

### ReasoningContent、ReasoningText 和 ReasoningFade {#reasoningcontent-reasoningtext-and-reasoningfade}

分别提供折叠内容、推理文字和底部渐隐。

## 步骤面板 {#the-step-panel-design}

按步骤展示简短标题与详情。流式模式可依次增加可见步骤。

```sh
npx shadcn@latest add "@assistant-ui/elements-reasoning-panel"
```

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  ReasoningPanel,
  type ReasoningStep,
} from "@/components/assistant-ui/elements/reasoning-panel";

function AssistantReasoning() {
  const parts = useAuiState((s) => s.message.parts);
  const steps = useMemo<ReasoningStep[]>(
    () =>
      parts.flatMap((part) =>
        part.type === "reasoning"
          ? [{ title: part.unstable_summary ?? "Thinking", body: part.text }]
          : [],
      ),
    [parts],
  );
  const streaming = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    return s.message.parts.some(
      (part) => part.type === "reasoning" && part.status.type === "running",
    );
  });
  const thoughtSeconds = useAuiState((s) => {
    const timings = s.message.parts.flatMap((part) =>
      part.type === "reasoning" && part.timing ? [part.timing] : [],
    );
    if (timings.length === 0) return undefined;
    let startedAt = Infinity;
    let completedAt = -Infinity;
    for (const timing of timings) {
      if (timing.completedAt === undefined) return undefined;
      startedAt = Math.min(startedAt, timing.startedAt);
      completedAt = Math.max(completedAt, timing.completedAt);
    }
    return Math.round((completedAt - startedAt) / 1000);
  });
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  if (steps.length === 0) return null;

  return (
    <ReasoningPanel
      steps={steps}
      visibleSteps={steps.length}
      streaming={streaming}
      open={userOpen ?? streaming}
      onOpenChange={setUserOpen}
      restingLabel={
        thoughtSeconds ? `Thought for ${thoughtSeconds}s` : "推理完成"
      }
    />
  );
}
```

```tsx
"use client";

import { useState } from "react";
import {
  ReasoningPanel,
  type ReasoningStep,
} from "@/components/assistant-ui/elements/reasoning-panel";

const STEPS: ReasoningStep[] = [
  { title: "阅读请求", body: "分析变动及其原因。" },
  { title: "定位边界", body: "查找需要修复的位置。" },
];

export function Trace() {
  const [open, setOpen] = useState(true);
  return (
    <ReasoningPanel
      steps={STEPS}
      visibleSteps={STEPS.length}
      streaming={false}
      open={open}
      onOpenChange={setOpen}
      restingLabel="推理用时 4 秒"
    />
  );
}
```

### ReasoningPanel {#reasoningpanel}

`steps` 传入标题和正文，`visibleSteps` 指定已出现的步骤数，`streaming` 表示仍在生成，`open` 和 `onOpenChange` 控制展开。
