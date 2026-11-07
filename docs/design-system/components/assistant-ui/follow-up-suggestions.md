---
title: Follow-up suggestions（后续建议）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Follow-up suggestions（后续建议）

在一次回复结束后，用可横向滚动的按钮提供下一步建议。

<demo react="assistant-ui/follow-up-suggestions-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/follow-up-suggestions"
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

向运行时提供建议，再把按钮组放到对话页脚。

### 向运行时提供建议 {#give-your-runtime-suggestions}

在外部存储运行时传入 `suggestions`。每一项至少包含实际发送的 `prompt`。

```tsx
const runtime = useExternalStoreRuntime({
  messages,
  convertMessage,
  onNew: async (message) => {
    /* append the message in your store */
  },
  suggestions: [
    { prompt: "整理为待办事项" },
    { prompt: "写一个简短版本" },
  ],
});
```

### 在消息之后渲染 {#render-it-after-the-messages}

将 `ThreadFollowupSuggestions` 放在 `ThreadPrimitive.ViewportFooter` 中，位于输入区前面。

```tsx
import { ThreadPrimitive } from "@assistant-ui/react";
import { ThreadFollowupSuggestions } from "@/components/assistant-ui/elements/follow-up-suggestions.aui";

function ThreadViewportFooter() {
  return (
    <ThreadPrimitive.ViewportFooter>
      <ThreadFollowupSuggestions />
      <Composer />
    </ThreadPrimitive.ViewportFooter>
  );
}
```

## 结构 {#anatomy}

单行按钮依次显示标题与可选标签。内容溢出时可横向滚动，边缘用渐隐提示剩余内容。

```tsx
<div> {/* horizontally scrolling, no visible scrollbar */}
  <button>{/* title (or prompt as fallback) */}<span>{/* label, when set */}</span></button>
  {/* one per suggestion */}
</div>
```

## 示例 {#examples}

可把按钮上的短标题与发送给模型的完整提示分开。

### 标题、标签和提示 {#title-label-and-prompt}

`title` 用于主文案，`label` 是可选补充，`prompt` 是实际内容。省略标题时直接显示提示。

```tsx
suggestions: [
  { title: "Weather", label: "旧金山", prompt: "旧金山今天的天气如何？" },
  { prompt: "总结内容" },
]
```

### 如何发送建议 {#how-a-suggestion-sends}

`ThreadPrimitive.Suggestion` 使用 `prompt` 和 `send`，因此点击后直接提交。

## API 参考 {#api-reference}

运行时版本会根据对话状态决定是否显示。

### 对话状态 {#thread-state}

仅在对话非空、未在生成且有可用建议时显示。

### 底层 primitive {#primitive-composed}

每个按钮由 `ThreadPrimitive.Suggestion` 渲染。

## 纸面胶囊设计 {#the-paper-pill-design}

独立版本从属性接收建议和点击事件，适合对话之外的静态或自定义场景。

```sh
npx shadcn@latest add "@assistant-ui/elements-suggestions"
```

```tsx
"use client";

import { ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { paper } from "@/components/assistant-ui/elements/surfaces";

function SuggestionRow() {
  const suggestions = useAuiState((s) => s.thread.suggestions);

  return (
    <div className="flex max-w-md flex-wrap justify-center gap-2">
      {suggestions.map((suggestion, index) => (
        <ThreadPrimitive.Suggestion
          key={suggestion.prompt}
          prompt={suggestion.prompt}
          send
          className={cn(
            paper,
            "fade-in slide-in-from-bottom-2 animate-in fill-mode-both rounded-full px-4 py-2 text-[13px]",
          )}
          style={{ animationDelay: `${index * 70}ms` }}
        >
          {suggestion.title ?? suggestion.prompt}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
}
```

```tsx
"use client";

import { useState } from "react";
import { Suggestions } from "@/components/assistant-ui/elements/suggestions";

export function NextTurn() {
  const [cycle, setCycle] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const suggestions = ["换种方式解释", "给出一个示例", "接下来做什么？"];

  return (
    <Suggestions
      suggestions={suggestions}
      selectedSuggestion={selected}
      cycle={cycle}
      onSuggestion={(suggestion) => {
        setSelected(suggestion);
        send(suggestion);
      }}
    />
  );
}
```

### Suggestions {#suggestions}

传入建议列表，并通过选择回调接收当前选项。
