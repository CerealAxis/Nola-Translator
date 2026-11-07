---
title: Empty state（空状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Empty state（空状态）

在会话为空时显示欢迎内容和可直接发起的建议。

<demo react="assistant-ui/empty-state-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-empty-state"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-empty-state.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 在空会话时显示

用 `AuiIf` 检查 `s.thread.isEmpty`。只有在会话没有消息且历史记录已加载后才显示空状态。

```tsx
"use client";

import { AuiIf } from "@assistant-ui/react";
import { EmptyState, EmptyStateGreeting } from "./empty-state";

function Welcome() {
  return (
    <AuiIf condition={(s) => s.thread.isEmpty}>
      <EmptyState>
        <EmptyStateGreeting>有什么可以帮你？</EmptyStateGreeting>
        {/* 对应槽位内容 */}
      </EmptyState>
    </AuiIf>
  );
}
```

### 把建议变为实际提示词

通过 `ThreadPrimitive.Suggestion` 将建议写入草稿或立即发送。

```tsx
import { useAuiState, ThreadPrimitive } from "@assistant-ui/react";
import { EmptyStateSuggestions, EmptyStateSuggestion } from "./empty-state";

function Suggestions() {
  const suggestions = useAuiState((s) => s.thread.suggestions);
  return (
    <EmptyStateSuggestions>
      {suggestions.map((suggestion, index) => (
        <ThreadPrimitive.Suggestion key={suggestion.prompt} prompt={suggestion.prompt} asChild>
          <EmptyStateSuggestion index={index}>
            {suggestion.title ?? suggestion.prompt}
          </EmptyStateSuggestion>
        </ThreadPrimitive.Suggestion>
      ))}
    </EmptyStateSuggestions>
  );
}
```

**独立使用**

### 提供几个起始建议

独立版提供少量清晰的起始建议，并连接真实动作。

```tsx
"use client";

import {
  EmptyState,
  EmptyStateGreeting,
  EmptyStateSuggestions,
  EmptyStateSuggestion,
  EmptyStateComposer,
} from "@/components/assistant-ui/elements/empty-state";

const STARTERS = ["总结此文档", "起草回复", "解释此错误"];

export function Welcome({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <EmptyState>
      <EmptyStateGreeting>有什么可以帮你？</EmptyStateGreeting>
      <EmptyStateSuggestions>
        {STARTERS.map((prompt, index) => (
          <EmptyStateSuggestion key={prompt} index={index} onClick={() => onPick(prompt)}>
            {prompt}
          </EmptyStateSuggestion>
        ))}
      </EmptyStateSuggestions>
      <EmptyStateComposer placeholder="随便问点什么" onSend={() => onPick("")} />
    </EmptyState>
  );
}
```

### 让建议依次出现

需要时为各建议设置顺序延迟，让它们依次进入。

```tsx
{STARTERS.map((prompt, index) => (
  <EmptyStateSuggestion key={prompt} index={index}>
    {prompt}
  </EmptyStateSuggestion>
))}
```

## 结构 {#anatomy}

由图标、标题、说明和建议列表组成，可将各部分独立放入布局。

```tsx
<div data-slot="empty-state">
  <h2 data-slot="empty-state-greeting" />
  <div data-slot="empty-state-suggestions">
    <button data-slot="empty-state-suggestion" />
  </div>
  <div data-slot="empty-state-composer">
    <span>{/* 对应槽位内容 */}</span>
    <button aria-label="发送" />
  </div>
</div>
```

欢迎语、建议与编辑器按顺序入场，编辑器最后出现。`EmptyStateComposer` 的 `placeholder` 用于展示。未提供 `onSend` 时禁用发送按钮。

## 示例 {#examples}

### 调整空状态布局

对根布局、标题区或建议组使用 `className`。

```tsx
<EmptyState className="max-w-lg gap-4">
  <EmptyStateGreeting className="animate-none text-3xl">
    有什么可以帮你？
  </EmptyStateGreeting>
  {/* ... */}
</EmptyState>
```

### 建议进入延迟

按列表顺序设置 delay，保持先后次序。

**使用运行时**

```tsx
{suggestions.map((suggestion, index) => (
  <ThreadPrimitive.Suggestion key={suggestion.prompt} prompt={suggestion.prompt} asChild>
    <EmptyStateSuggestion index={index}>{suggestion.prompt}</EmptyStateSuggestion>
  </ThreadPrimitive.Suggestion>
))}
```

## API 参考 {#api-reference}

**使用运行时**

### 基础组件

| 组成部分 | Renders | 说明 |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `AuiIf` | children | 根据运行时状态条件渲染内容。 |
| `ThreadPrimitive.Suggestion` | `button` | 将建议写入草稿或直接发送。 |

### 会话状态

| 选择器 | 类型 | 说明 |
| ---------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `s.thread.isEmpty` | `boolean` | 当前会话是否没有消息。 |
| `s.thread.suggestions` | `readonly ThreadSuggestion[]` | 当前会话的建议提示词。 |

**独立使用**

### EmptyState family

| 组成部分 | Renders | Props | 说明 |
| ----------------------- | -------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `EmptyState` | `div` | `className` | 空状态的根容器。 |
| `EmptyStateGreeting` | `h2` | `className` | 显示欢迎标题与说明。 |
| `EmptyStateSuggestions` | `div` | `className` | 排列起始建议。 |
| `EmptyStateSuggestion` | `button` | `index?: number` (default `0`), `className` | 一条可以触发的起始建议。 |
| `EmptyStateComposer` | `div` | `placeholder` (required `string`), `onSend?: () => void`, `className` | 放置底部编辑器。 |

各部分会将其余属性转发给自身的根元素。
