---
title: Message timing（消息耗时）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Message timing（消息耗时）

展示当前消息的流式统计，包括首个 token 的等待时间、总耗时和生成速度。

<demo react="assistant-ui/message-timing-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/message-timing"
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

在消息作用域读取流式统计，再选择放在操作栏或消息末尾。

### 读取消息用时 {#read-the-messages-timing}

`useMessageTiming` 从当前消息读取运行时记录的时间和吞吐信息。

```tsx
"use client";

import { useMessageTiming } from "@assistant-ui/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FC } from "react";

const formatTimingMs = (ms: number | undefined): string => {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const MessageTiming: FC<{
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}> = ({ className, side = "right" }) => {
  const timing = useMessageTiming();
  if (timing?.totalStreamTime === undefined) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="消息用时"
              className={className}
            />
          }
        >
          {formatTimingMs(timing.totalStreamTime)}
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={8}>
          {/* first token, total, speed, chunks; see Anatomy below */}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
```

### 添加到消息操作栏 {#add-it-to-the-messages-action-bar}

在 `ActionBarPrimitive.Root` 内放入 `MessageTiming`，与复制或重新生成按钮并列。

```tsx
import { ActionBarPrimitive } from "@assistant-ui/react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { MessageTiming } from "@/components/assistant-ui/elements/message-timing.aui";

function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">{/* ... */}</TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <MessageTiming />
    </ActionBarPrimitive.Root>
  );
}
```

## 结构 {#anatomy}

触发区呈现简短用时，提示区域展开首 token、总耗时和生成速度等明细。

```tsx
<button aria-label="消息用时">{/* e.g. "1.24s" */}</button>
<div>
  <div>First token   <span>{/* only when firstTokenTime is set */}</span></div>
  <div>Total         <span>{/* always, once the badge is visible */}</span></div>
  <div>Speed         <span>{/* only when tokensPerSecond is set */}</span></div>
  <div>Chunks        <span>{/* always, once the badge is visible */}</span></div>
</div>
```

## 示例 {#examples}

选择工具提示出现的方向，也可在自己的界面中沿用组件的格式规则。

### 工具提示方向 {#tooltip-side}

用 `side` 指定统计提示相对于触发器显示的位置。

```tsx
<MessageTiming side="left" />
```

### 显示格式 {#formatting-rule}

用时按持续时间显示。尚未获得的统计值留空，生成速度以每秒 token 数显示。

## API 参考 {#api-reference}

可以从运行时读取用时，也可以给独立组件传入已知统计值。

### 消息状态 {#message-state}

统计与当前消息绑定，由实际流式传输记录，静态消息可能没有这些数据。

### MessageTiming 属性 {#messagetiming-props}

设置提示的位置并传入所需类名。组件在相应消息作用域读取统计。

## 耗时页脚 {#the-timing-footer-design}

独立布局将简短耗时放在消息末尾，使用提示展示完整统计。

```sh
npx shadcn@latest add "@assistant-ui/elements-message-timing"
```

```tsx
"use client";

import { useMessageTiming } from "@assistant-ui/react";
import {
  MessageTiming,
  type TimingStat,
} from "@/components/assistant-ui/elements/message-timing";

const formatMs = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;

function TimingFooter() {
  const timing = useMessageTiming();
  if (!timing) return null;

  const stats: TimingStat[] = [
    timing.firstTokenTime !== undefined && {
      label: "ttft",
      value: formatMs(timing.firstTokenTime),
    },
    timing.totalStreamTime !== undefined && {
      label: "total",
      value: formatMs(timing.totalStreamTime),
    },
    timing.tokensPerSecond !== undefined && {
      label: "tok/s",
      value: timing.tokensPerSecond.toFixed(1),
    },
    { label: "chunks", value: String(timing.totalChunks) },
  ].filter((stat): stat is TimingStat => stat !== false);

  return <MessageTiming stats={stats} />;
}
```

```tsx
import {
  MessageTiming,
  type TimingStat,
} from "@/components/assistant-ui/elements/message-timing";

const stats: TimingStat[] = [
  { label: "ttft", value: "0.4s" },
  { label: "total", value: "2.6s" },
  { label: "tok/s", value: "61" },
];

<MessageTiming stats={stats} />;
```

### MessageTiming {#messagetiming}

独立版本从外部属性接收统计数据，适用于已有服务端记录或静态预览。
