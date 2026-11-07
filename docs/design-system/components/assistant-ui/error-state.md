---
title: Error state（错误状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Error state（错误状态）

在消息中显示失败状态，并提供重试入口。

当回复失败时，它会出现在消息所在的位置：一个安静的红色横幅，通过重试按钮指出出现的问题，或者在重试时，显示一条旋转线，上面写着“正在重试”。对于运行时，失败和重试都来自消息本身。在独立版中，你可以自己保存标题、详细信息和重试状态。

<demo react="assistant-ui/error-state-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-error-state"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-error-state.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

运行中失败的辅助消息在 `s.message.status` 上携带其错误。`MessagePrimitive.Error` 仅在其子级存在时才渲染它，因此你永远不需要自己检查它。

### 渲染失败消息 {#render-the-failed-message}

```tsx
"use client";

import { ErrorPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { CircleAlertIcon } from "lucide-react";

export function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="flex items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm dark:bg-red-500/10">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
        <ErrorPrimitive.Message className="text-red-600 dark:text-red-400" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}
```

   `ErrorPrimitive.Root` 渲染为 `role="alert"`。`ErrorPrimitive.Message` 读取错误本身 (`s.message.status.type === "incomplete" && s.message.status.reason === "error"`)，并在不传递子项时回退到 `String(error)`，因此这里有一个消息字符串，而不是单独的标题和详细信息。

### 为重试按钮绑定操作 {#wire-the-retry-button}

   `ActionBarPrimitive.Reload` 调用 `aui.message.reload()`，它从此消息的父级重新运行，并在会话已经运行时被禁用：

```tsx
import { ActionBarPrimitive } from "@assistant-ui/react";
import { RefreshCwIcon } from "lucide-react";

<ActionBarPrimitive.Reload className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
  <RefreshCwIcon className="size-3" />
  重试
</ActionBarPrimitive.Reload>
```

**独立版**

独立的 `ErrorState` 在 `retrying` 上切换其整个布局：带有标题和详细信息的两行警报，或单个旋转状态行。

### 维护失败状态并触发重试 {#hold-the-failure-and-drive-retry}

```tsx
"use client";

import { useState } from "react";
import { ErrorState } from "@/components/assistant-ui/elements/error-state";

export function ReplyError() {
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(true);

  if (!failed) return null;

  return (
    <ErrorState
      title="无法到达该型号"
      detail="30秒后请求超时。"
      retrying={retrying}
      onRetry={async () => {
        setRetrying(true);
        const ok = await retry();
        setRetrying(false);
        setFailed(!ok);
      }}
    />
  );
}
```

### 重试成功后清除错误 {#drop-it-once-the-retry-lands}

   没有内置的成功状态。一旦重试的请求返回干净，就会卸载 `ErrorState`（如上所述，在 `failed` 变为 false 时），因此横幅让位给它所代表的回复。

## 结构 {#anatomy}

```tsx
<div data-slot="error-state" role="alert">
  <svg /> {/* alert icon */}
  <div>
    <p>{/* title */}</p>
    <p>{/* detail */}</p>
  </div>
  <button>重试</button>
</div>
```

虽然 `retrying` 为 true，但整个布局交换为 `role="status"` 而不是 `role="alert"` 的单行：旋转的刷新图标和闪烁的“重试”标签，没有标题、详细信息或按钮。两种状态共享 `error-state` 插槽，并且每当组件（重新）安装时都会淡入超过 300ms，因为 `key="error"`/`key="retrying"` 会强制在每个开关上重新安装。在运行时只有一种这样的状态：`ErrorPrimitive.Root` 始终是 `role="alert"`，并且没有附带的“重试”子状态。通过观察 `s.thread.isRunning` 中你刚刚重新加载的消息来自行复制它，如果新的尝试也失败，则再次返回到错误横幅。

## 示例 {#examples}

### 重试时 {#while-retrying}

**独立版**

在`onRetry`中围绕异步调用翻转`retrying`，如“保持故障并驱动重试”所示。只要承诺悬而未决，横幅就会交换到状态行。

从按钮的角度来看，

**运行时版**

重新加载是“即发即忘”。如果你希望在新尝试流入时拥有自己的“重试”行，请观看 `s.thread.isRunning`：

```tsx
const retrying = useAuiState((s) => s.thread.isRunning);
```

### 错误文本来自哪里 {#where-the-error-text-comes-from}

**运行时版**

`useMessageError()` 返回 `ErrorPrimitive.Message` 呈现的值：当运行是字符串时，运行的 `status.error`。当错误是带有字符串 `message` 的对象时，运行的 `message`。否则返回原始错误值。当状态没有错误时，运行 `"An error occurred"`。 `ErrorPrimitive.Message` 通过 `String()` 传递该值。如果需要`MessagePrimitive.Error`之外的错误，直接调用钩子。

```tsx
import { useMessageError } from "@assistant-ui/core/react";

const error = useMessageError();
```

该钩子是从 `@assistant-ui/core/react` 导出的，而不是从 `@assistant-ui/react` 导出的，因此将 `@assistant-ui/core` 添加到应用程序的依赖项中。

**独立版**

`title` 和 `detail` 是你传递的两个字符串。将你捕获的错误拆分为一个简短的标题和一个较长的详细信息，但是对于你的源来说是有意义的（例如，获取错误的 `name` 和 `message`）。

### 调整横幅 {#restyle-the-banner}

两种用法都支持通过 `className` 调整根元素。失败横幅的红色调和重试行的闪烁是仅有的两种需要调整的视觉状态。

```tsx
<ErrorState className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### MessagePrimitive 和 ErrorPrimitive {#messageprimitive-and-errorprimitive}

| 部分 | 渲染结果 | 说明 |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| `MessagePrimitive.Error` | 片段 | 仅当消息携带错误时渲染子项。 |
| `ErrorPrimitive.Root` | `div` | `role="alert"`. |
| `ErrorPrimitive.Message` | `span` | 错误文本。传递子项以覆盖默认后备。 |
| `ActionBarPrimitive.Reload` | `button` | 重新生成消息。当会话已经运行时禁用。 |

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `s.message.status?.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | `"incomplete"` 和 `reason: "error"` 是失败的运行的样子。 |
| `useMessageError()` | `() => string \| number \| boolean \| ReadonlyJSONObject \| ReadonlyJSONArray \| undefined` | 错误值，或消息未失败时的 `undefined`。从 `@assistant-ui/core/react` 导出。 |
| `aui.message.reload(config?)` | `(config?: { runConfig?: RunConfig }) => void` | 通过重新生成此消息来重试。 |

**独立版**

### ErrorState {#errorstate}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------ | -------- | ---------------------------------------------------------- |
| `title` | `string` |  | 简短的失败标题。 |
| `detail` | `string` |  | 标题下显示的较长解释。 |
| `retrying` | `boolean` |  | 将整个布局交换为单旋转状态线。 |
| `onRetry` | `() => void` |  | 按下重试按钮时调用。 |
| `className` | `string` |  | 合并到根元素。 |

所有其他 `div` 属性（不包括组件自行设置的 `role`）都转发到根。
