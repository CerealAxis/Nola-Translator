---
title: Guardrail notice（防护提示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Guardrail notice（防护提示）

说明助手无法执行某项请求的原因，并给出可行的替代操作。

图标、标题、简短的策略标签、解释以及读者可以选择的替代方案的可选列表。与通用故障横幅（请参阅 `/elements/error-state`）不同，这是专门针对策略停止而不是传输或服务器错误。通过运行时，你可以从消息本身的状态检测停止。独立的你决定何时显示它。

<demo react="assistant-ui/guardrail-notice-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-guardrail-notice"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-guardrail-notice.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

拒绝不是与普通消息不同的概念：它是一条辅助消息，其状态以 `"incomplete"` 结束，原因为 `"content-filter"`。通知上的其他所有内容、标题、解释和替代项都是你的应用程序提供的内容。运行时仅告诉你发生了停止。

### 检测内容过滤导致的中止 {#detect-a-content-filter-stop}

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";

function useIsGuardrailStop() {
  return useAuiState((s) => {
    const status = s.message.status;
    return status?.type === "incomplete" && status.reason === "content-filter";
  });
}
```

### 发送替代请求 {#send-an-alternative-back}

```tsx
import { useAui } from "@assistant-ui/react";
import { GuardrailNotice } from "@/components/assistant-ui/elements/guardrail-notice";

const ALTERNATIVES = ["解释同一问题的防守方"];

function AssistantGuardrail() {
  const isGuardrailStop = useIsGuardrailStop();
  const aui = useAui();
  if (!isGuardrailStop) return null;

  return (
    <GuardrailNotice
      title="我无能为力"
      explanation="This asks for something I can't assist with directly."
      policy="content-filter"
      alternatives={ALTERNATIVES}
      onPick={(alternative) => aui.thread.append(alternative)}
    />
  );
}
```

   `aui.thread.append(text)` 将 `text` 作为新用户消息发送并开始运行，就像读者自己键入并发送一样。

**独立版**

独立版，显示通知及其内容，完全由你决定。

### 维护拒绝状态 {#hold-the-refusal-state}

```tsx
"use client";

import { GuardrailNotice } from "@/components/assistant-ui/elements/guardrail-notice";

export function RefusalNotice() {
  return (
    <GuardrailNotice
      title="我无能为力"
      explanation="This asks for a working exploit against infrastructure you don't own."
      policy="policy"
      alternatives={["解释如何防御此问题"]}
    />
  );
}
```

### 用 onPick 接入重试 {#wire-onpick-to-your-own-retry}

```tsx
<GuardrailNotice
  /* ... */
  onPick={(alternative) => sendMessage(alternative)}
/>
```

   `onPick` 可选。省略它会将替代项呈现为非交互式建议而不是按钮。

## 结构 {#anatomy}

```tsx
<div data-slot="guardrail-notice">
  <div>{/* shield icon, title, policy tag */}</div>
  <p>{/* explanation, always rendered */}</p>
  <div>{/* "try instead" label + one button per alternative, only when alternatives.length > 0 */}</div>
</div>
```

当`alternatives`为空数组时，alternatives块被省略。通知在解释段落之后结束。当提供 `onPick` 时，每个替代项都会呈现为按钮，否则呈现为非交互式文本。

## 示例 {#examples}

### 读取拒绝原因

不完整消息上的 {#reading-the-refusal-reason}

`status.reason` 是一组固定字符串之一。`"content-filter"` 是专门映射到护栏站的代码，与 `"cancelled"`、`"tool-calls"`、`"length"`、`"error"` 或 `"other"` 不同。

```tsx
const policy = status.type === "incomplete" ? status.reason : undefined;
```

### 调整通知样式 {#restyle-the-notice}

两种用法都以 `className` 为根，在共享 `paper` 表面上以 `flex w-full max-w-sm flex-col gap-3 rounded-[20px]` 开头。策略标签从`surfaces.tsx`读取`mono`标记。盾牌图标的琥珀色是在组件中设置的。

```tsx
<GuardrailNotice className="max-w-none rounded-2xl" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/调用 | 类型 | 说明 |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `s.message.status` | `MessageStatus \| undefined` | `type === "incomplete"` 和 `reason === "content-filter"` 标记护栏停止。 |
| `aui.thread.append(message)` | `(message: CreateAppendMessage) => void` | 作为新用户轮次发送纯字符串（或完整消息）。用它来发送回选定的替代方案。 |

**独立版**

### GuardrailNotice {#guardrailnotice}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `title` | `string` |  | 盾牌图标旁边的标题。 |
| `explanation` | `string` |  | 正文。始终呈现。 |
| `policy` | `string` |  | 标题行末尾显示的短标签。 |
| `alternatives` | `readonly string[]` |  | 建议接下来的提示。空数组会忽略整个块。 |
| `onPick` | `(alternative: string) => void` |  | 使用所选替代文本进行调用。如果没有它，替代方案就会呈现为非交互式建议。 |
| `className` | `string` |  | 合并到根元素。 |

除 `children`、`title`、`explanation`、`policy`、`alternatives` 和 `onPick` 之外的其余 `div` 属性会传给根元素。
