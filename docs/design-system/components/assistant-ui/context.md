---
title: Context（上下文）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Context（上下文）

在编辑器工具栏显示上下文窗口的用量，并查看分项。

<demo react="assistant-ui/context-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-composer"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-composer.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 读取当前用量

从当前会话和消息用量推导已使用的 token 总量。

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";

function useThreadTokensUsed(): number {
  return useAuiState((s) =>
    s.thread.messages.reduce((sum, message) => {
      const steps = message.metadata.steps ?? [];
      return (
        sum +
        steps.reduce(
          (stepSum, step) =>
            stepSum +
            (step.usage?.inputTokens ?? 0) +
            (step.usage?.outputTokens ?? 0),
          0,
        )
      );
    }, 0),
  );
}
```

### 为用量环提供数据

把用量和上限传给 `ComposerContext` 绘制进度环。

```tsx
import { ComposerContext } from "@/components/assistant-ui/elements/composer";

const SYSTEM_PROMPT_TOKENS = 1;
const TOOL_SCHEMA_TOKENS = 3;
const MODEL_CONTEXT_WINDOW = 200;

export function ComposerContextRail() {
  const used = useThreadTokensUsed();
  return (
    <ComposerContext
      usage={{
        system: SYSTEM_PROMPT_TOKENS,
        tools: TOOL_SCHEMA_TOKENS,
        messages: Math.round(used / 1000),
        total: MODEL_CONTEXT_WINDOW,
      }}
    />
  );
}
```

**独立使用**

### 提供用量明细

若应用拥有细分数据，可在触发器中加入上下文用量分项。

```tsx
"use client";

import { ComposerContext } from "@/components/assistant-ui/elements/composer";

export function ComposerRail() {
  return (
    <ComposerContext usage={{ system: 12, tools: 8, messages: 54, total: 200 }} />
  );
}
```

## 结构 {#anatomy}

紧凑的用量环可作为工具栏触发器，打开后显示用量详情。

```tsx
<div data-slot="composer-context">
  <div>{/* 鼠标悬停或键盘聚焦时显示 */}</div>
  <button aria-label="上下文用量">{/* 对应槽位内容 */}</button>
</div>
```

用量环根据 `system + tools + messages` 与 `total` 的比例绘制。总量为 0 时比例按 0 处理。用量超过 85% 时显示警示状态。详情在悬停或键盘聚焦时显示。

## 示例 {#examples}

### 放到工具栏

与模型选择等操作一起放入 `ComposerToolbar`。

```tsx
<ComposerToolbar>
  <ComposerActions>
    <ComposerAttachButton onClick={pick} />
  </ComposerActions>
  <ComposerActions>
    <ComposerContext usage={usage} />
    <ComposerSend streaming={streaming} idle={!value} onClick={send} />
  </ComposerActions>
</ComposerToolbar>
```

### 调整触发器样式

使用 `className` 调整上下文入口的布局。

```tsx
<ComposerContext className="[&_button]:size-9" usage={usage} />
```

## API 参考 {#api-reference}

**使用运行时**

### 会话状态

| 选择器 | 类型 | 说明 |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.thread.messages` | `readonly MessageState[]` | 当前会话的消息列表。 |

模型的窗口上限和分项由应用提供。`ComposerUsage` 为 `{ system: number; tools: number; messages: number; total: number }`。

**独立使用**

### ComposerContext

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usage` | `ComposerUsage` | 必填 | 上下文窗口的用量数据。 |
| `className` | `string` |  | 合并到根元素的类名。 |
