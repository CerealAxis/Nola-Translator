---
title: Tool failure（工具故障）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Tool failure（工具故障）

显示工具错误和尝试次数，并允许单独重试该调用。

失败的工具调用有自己的卡片：调用了什么、错误、尝试了多少次以及重试或跳过的方式。对于运行时，失败来自于工具调用的状态。在独立版中，你可以尝试并自己发送消息。

<demo react="assistant-ui/tool-failure-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-tool-error"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-tool-error.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

失败的调用是指其状态确定为 `"incomplete"` 的调用。在显示工具正常结果的同一渲染器内对其进行分支。

### 从工具包条目渲染失败 {#render-the-failure-from-the-toolkit-entry}

```tsx
"use client";

import { useState } from "react";
import { useAui, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { ToolError } from "@/components/assistant-ui/elements/tool-error";

export function SearchTool({ toolName, args, status, result }: ToolCallMessagePartProps<{ query: string }, string>) {
  const [attempt, setAttempt] = useState(1);
  const aui = useAui();

  if (status?.type === "incomplete") {
    return (
      <ToolError
        name={toolName}
        target={args.query}
        message={typeof status.error === "string" ? status.error : JSON.stringify(status.error)}
        attempt={attempt}
        maxAttempts={3}
        retrying={false}
        onRetry={() => {
          setAttempt((a) => Math.min(a + 1, 3));
          aui.message.reload();
        }}
      />
    );
  }

  return <p>{result}</p>;
}
```

   `status.error` 携带失败的 `execute` 抛出的任何内容或后端报告的任何内容。它是 `unknown`，因此在直接渲染之前请注意字符串大小写。

### 重新生成轮次重试 {#regenerate-the-turn-to-retry}

```tsx
import { AuiConfig, AuiProvider, Tools, defineToolkit, useAui } from "@assistant-ui/react";
import { z } from "zod";
import { SearchTool } from "./search-toolkit";

const toolkit = defineToolkit({
  search_web: {
    type: "frontend",
    description: "在网络上搜索查询。",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => runSearch(query),
    render: SearchTool,
  },
});

function Providers({ children }: { children: React.ReactNode }) {
  const aui = useAui();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AuiProvider extends={aui} config={config}>
      {children}
    </AuiProvider>
  );
}
```

   assistant-ui 不会就地重试单个工具调用。`aui.message.reload()` 重新发出整个轮次，再次尝试调用 `search_web`。

**独立版**

独立，无需重新启动：`onRetry` 可以直接再次调用导致失败的任何内容，并且尝试计数由你跟踪。

### 保持尝试次数 {#hold-the-attempt-count}

```tsx
"use client";

import { useState } from "react";
import { ToolError } from "@/components/assistant-ui/elements/tool-error";

export function SearchFailure({ query }: { query: string }) {
  const [attempt, setAttempt] = useState(1);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("The search API timed out.");

  return (
    <ToolError
      name="search_web"
      target={query}
      message={message}
      attempt={attempt}
      maxAttempts={3}
      retrying={retrying}
      onRetry={() => retry(query)}
    />
  );
}
```

### 不重启轮次重试 {#retry-without-restarting-the-turn}

```tsx
async function retry(query: string) {
  setRetrying(true);
  try {
    const result = await runSearch(query);
    // success: replace this card with `result` in your own state
  } catch (err) {
    setAttempt((a) => a + 1);
    setMessage(err instanceof Error ? err.message : String(err));
  } finally {
    setRetrying(false);
  }
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="tool-error">
  <div>{/* icon, name, target, "attempt/maxAttempts" */}</div>
  <div>{/* message, monospace */}</div>
  <div>
    <button>{/* Skip, disabled when onSkip is absent */}</button>
    <button>{/* Retry, disabled and spinning while retrying */}</button>
  </div>
</div>
```

Skip 没有默认行为：不传递 `onSkip` 会使按钮呈现但禁用，因此只有重试路径的卡仍会显示这两个操作。当 `retrying` 为 true 时，重试会自行禁用，并将其图标替换为加载指示器。卡中的任何其他内容都不会对 `retrying` 做出反应。

## 示例 {#examples}

### 读取真正的故障原因 {#read-the-real-failure-reason}

**运行时版**

`status.type === "incomplete"` 涵盖的不仅仅是工具错误：`status.reason` 还可以是 `"cancelled"`、`"length"`、`"content-filter"` 或 `"other"`。只显示 `"error"` 的重试卡，其余的给出各自的消息：

```tsx
if (status?.type === "incomplete" && status.reason !== "error") {
  return <p>完成前取消。</p>;
}
```

### 调整卡片 {#restyle-the-card}

两种用法都支持通过 `className` 调整根元素。根使用共享的 `paper` 表面，消息框使用 `field`，名称和尝试计数器使用 `mono`，因此在 `surfaces.tsx` 中重新定位这些标记会调整这张卡以及基于它们构建的其他所有内容。跳过和重试按钮保留自己的内联类而不是共享标记。

## API 参考 {#api-reference}

**运行时版**

### 工具调用状态 {#tool-call-status}

| 字段 | 类型 | 说明 |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | `"incomplete"` 是失败（或取消）状态。 |
| `status.reason` | `"cancelled" \| "length" \| "content-filter" \| "other" \| "error"` | 仅当 `status.type` 为 `"incomplete"` 时出现。 |
| `status.error` | `unknown` | 仅当 `status.type` 为 `"incomplete"` 时出现。抛出的值或后端报告的错误。 |
| `useToolCallElapsed()` | `number \| undefined` | 当前调用已用时间。`undefined` 一旦结算，没有记录持续时间。 |
| `aui.message.reload()` | `() => void` | 重新发出当前的助手轮次，包括其工具调用。 |

**独立版**

### ToolError {#toolerror}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ------------ | -------- | ------------------------------------------------------------------- |
| `name` | `string` |  | 工具名称。 |
| `target` | `string` |  | 调用的作用是什么。 |
| `message` | `string` |  | 错误文本。 |
| `attempt` | `number` |  | 当前尝试次数。 |
| `maxAttempts` | `number` |  | 允许尝试。 |
| `retrying` | `boolean` |  | 为 true 时禁用并旋转重试按钮。 |
| `onRetry` | `() => void` |  | 从重试按钮调用。 |
| `onSkip` | `() => void` |  | 从跳过按钮调用。忽略它，该按钮将保持禁用状态。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
