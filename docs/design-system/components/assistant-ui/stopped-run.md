---
title: Stopped run（已停止的运行）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Stopped run（已停止的运行）

停止后保留已经生成的回复，并提供继续生成入口。

StoppedRun 展示了被取消的一代留下的东西：在停止之前到达的文字、一个小原因徽章以及一种重新拾起或放开它的方法。对于运行时，文字和原因来自于被取消的消息。独立的你传递你捕获的任何东西。

<demo react="assistant-ui/stopped-run-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-stopped-run"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-stopped-run.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

已取消的消息将与 `status.reason === "cancelled"` 一起放入 `status.type === "incomplete"` 中。到那时为止它的内容仍然存在。只是奔跑停止了。

### 检测已取消的消息并接入操作 {#detect-a-cancelled-message-and-wire-its-actions}

```tsx
"use client";

import { useMemo } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { StoppedRun } from "@/components/assistant-ui/elements/stopped-run";

function CancelledNotice() {
  const aui = useAui();
  const status = useAuiState((s) =>
    s.message.role === "assistant" ? s.message.status : undefined,
  );
  const content = useAuiState((s) => s.message.content);
  const words = useMemo(
    () =>
      content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .flatMap((part) => part.text.split(" ")),
    [content],
  );

  if (status?.type !== "incomplete" || status.reason !== "cancelled") return null;

  return (
    <StoppedRun
      words={words}
      reason="被你拦住了"
      onContinue={() => aui.message.reload()}
      onDiscard={() => aui.message.delete()}
    />
  );
}
```

### 继续生成的行为 {#understand-what-continue-really-does}

   `reload()` 在同一轮次开始新的运行。它不会恢复确切的截止文本，因为 assistant-ui 没有内置的前缀延续基础组件。支持文字延续的后端需要部分文本本身，例如通过 `reload` 的 `runConfig.custom` 并在 `ChatModelAdapter` 内读回。

**独立版**

独立，StoppedRun 是演示性的：你决定什么算作停止并提供已经流式传输的单词。

### 流式生成停止时保留已收到的文本 {#freeze-the-words-when-a-stream-stops}

```tsx
"use client";

import { useState } from "react";
import { StoppedRun } from "@/components/assistant-ui/elements/stopped-run";

export function Answer() {
  const [words, setWords] = useState<string[]>([]);
  const [stopped, setStopped] = useState(false);

  function onStop() {
    controller.abort();
    setStopped(true);
  }

  if (!stopped) return null;

  return (
    <StoppedRun
      words={words}
      reason="被你拦住了"
      onContinue={() => resume(words)}
      onDiscard={() => setStopped(false)}
    />
  );
}
```

### 接入继续与丢弃操作 {#wire-continue-and-discard}

   这两个 prop 都没有默认行为。在你传递处理程序之前，两者都是无操作的。 `onContinue` 是你获取其余答案的地方。`onDiscard` 是你将其从自己的列表中删除的位置。

## 结构 {#anatomy}

```tsx
<div data-slot="stopped-run">
  <p>{/* words joined by a space, with a static cursor after them */}</p>
  <div>
    <span>{/* the reason badge, e.g. "stopped by you" */}</span>
    <button>继续</button>
    <button>丢弃</button>
  </div>
</div>
```

光标是装饰性的 (`aria-hidden`)，并且在安装组件时始终呈现。没有内部“仍在流式传输”状态来将其关闭。 `reason` 是自由格式文本，而不是固定枚举，因此徽章可以描述运行未完成的任何方式，而不仅仅是手动停止。

## 示例 {#examples}

### 运行停止的其他原因 {#other-reasons-a-run-stops}

**运行时版**

`status.reason` 不仅仅涵盖手动停止：`"length"`、`"content-filter"`、`"tool-calls"` 和 `"error"` 与 `"cancelled"` 一样都是实际值。相同的组件适合具有不同标签的任何一个：

```tsx
const LABEL: Record<string, string> = {
  cancelled: "stopped by you",
  length: "hit the length limit",
  "content-filter": "blocked by a content filter",
  error: "failed partway through",
};

<StoppedRun words={words} reason={LABEL[status.reason] ?? "stopped early"} />
```

**独立版**

该组件没有任何内容将 `reason` 与取消具体联系起来。任何说明文本提前停止原因的短标签都是有效值。

```tsx
<StoppedRun words={words} reason="连接丢失" />
```

### 丢弃操作的行为 {#where-discard-goes}

**运行时版**

```tsx
const onDiscard = () => aui.message.delete();
```

`delete()` 从会话中删除消息。它的 `Promise<void>` 返回存在是因为持久化运行时的删除是异步的。你很少需要等待点击处理程序的到来。

**独立版**

独立，丢弃是将草稿从你自己的列表中删除的任何内容。该组件仅调用处理程序。

```tsx
const onDiscard = () => setDrafts((prev) => prev.filter((d) => d.id !== draftId));
```

### 调整徽章和动作 {#restyle-the-badge-and-actions}

两种用法都支持通过 `className` 调整根元素。徽章从 `surfaces.tsx` 读取共享的 `field` 和 `mono` 表面。

```tsx
<StoppedRun className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/方法 | 类型 | 说明 |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.message.status` | `MessageStatus \| undefined` | `{ type: "incomplete", reason: "cancelled" }` 当消息因你按下停止键而停止时。其他 `incomplete` 原因：`"length"`、`"content-filter"`、`"tool-calls"`、`"error"`、`"other"`。 |
| `aui.thread.cancelRun()` | `() => void` | 停止当前运行。流消息进入上面的 `incomplete` 状态。 |
| `aui.message.reload(config?)` | `(config?: { runConfig?: RunConfig }) => void` | 本轮次开始新的运行。重新开始生成。它不会恢复截止文本。 |
| `aui.message.delete()` | `() => void \| Promise<void>` | 从会话中删除消息。 |

**独立版**

### StoppedRun {#stoppedrun}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ------------------- | -------- | --------------------------------------------------------------------------- |
| `words` | `readonly string[]` |  | 单词已经流式传输，用空格连接并给出尾随光标。 |
| `reason` | `string` |  | 徽章中显示的自由形式标签。 |
| `onContinue` | `() => void` |  | 当按下“继续”时调用。 |
| `onDiscard` | `() => void` |  | 当按下放弃按钮时调用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
