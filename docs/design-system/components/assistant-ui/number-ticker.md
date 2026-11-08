---
title: Number ticker（数字滚动）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Number ticker（数字滚动）

数值更新时逐位滚动显示。

数字滚动条将每个数字滚动到位，而不是交换文本到位，因此变化的计数读取为运动而不是闪烁。对于运行时，该值来自工具的结果。独立的你直接传入。

<demo react="assistant-ui/number-ticker-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-number-ticker"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-number-ticker.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

在运行时，数字滚动器只需要一个数字和一个标签，因此它的渲染器是目录中最小的渲染器之一：从工具调用中读取 `result`，并在其仍在运行时回落到零。

生成

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { NumberTicker } from "@/components/assistant-ui/elements/number-ticker";

export const TokenCountToolUI: ToolCallMessagePartComponent<
  Record<string, never>,
  { total: number }
> = ({ result, status }) => (
  <NumberTicker
    value={status.type === "complete" ? (result?.total ?? 0) : 0}
    label="代币"
  />
);
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { TokenCountToolUI } from "@/components/assistant-ui/elements/token-count-tool-ui";

export const toolkit = defineToolkit({
  get_token_count: {
    type: "frontend",
    description: "获取本次会话到目前为止生成的令牌数量。",
    parameters: z.object({}),
    execute: async () => ({ total: currentTokenCount() }),
    render: TokenCountToolUI,
  },
});
```

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

   请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)，了解后端定义的工具和授权请求。

**独立版**

独立运行，股票行情指示器完全受控：只要 `value` 发生变化，无论你喜欢什么来源，它都会重新渲染和滚动。

### 保持值 {#hold-the-value}

```tsx
"use client";

import { useState } from "react";
import { NumberTicker } from "@/components/assistant-ui/elements/number-ticker";

export function TokenCount() {
  const [value, setValue] = useState(0);
  return <NumberTicker value={value} label="代币" />;
}
```

### 工作发生时更新它 {#update-it-as-work-happens}

   任何改变 `value` 的状态更新都会触发滚动，因此轮询或套接字消息都以相同的方式工作。

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setValue((v) => v + Math.round(Math.random() * 40));
  }, 900);
  return () => clearInterval(id);
}, []);
```

## 示例 {#examples}

### 格式化大计数 {#formatting-large-counts}

`value` 在拆分为数字之前使用 `toLocaleString("en-US")` 进行格式化，因此千位分隔符在滚动数字之间显示为静态字符，而不是数字本身。屏幕阅读器从行上的 `aria-label` 读取相同格式的字符串，而不是解析各个滚动范围。

```tsx
<NumberTicker value={1234567} label="代币" />
// renders "1,234,567", with "," as plain characters between the rollers
```

### 调整数字滚动器样式 {#restyle-the-ticker}

两种用法都在根元素采用 `className`，这是一个围绕数字及其标签的列弹性容器。该标签从 `surfaces.tsx` 中共享的 `mono` 标记中读取。

```tsx
<NumberTicker className="gap-1" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### NumberTicker {#numberticker}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------- | -------- | ------------------------------------------------------------------------------------------- |
| `value` | `number` |  | 要显示的数字，采用 `toLocaleString("en-US")` 格式并拆分为滚动数字。 |
| `label` | `string` |  | 数字下方的标题。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
