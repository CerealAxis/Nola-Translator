---
title: Message branches（消息分支）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Message branches（消息分支）

在同一条消息的多个生成版本间切换，同时保留阅读位置。

重新生成的答案不会取代之前的答案。它成为一个同级分支。此元素显示当前分支和用于在同级分支之间移动的 `n / m` 步进器。对于运行时，分支来自会话。独立版由调用方传入分支。

<demo react="assistant-ui/message-branches-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-message-branches"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-message-branches.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

每个 assistant-ui 运行时都会跟踪每条消息的分支。步进器从消息中读取 `branchNumber` 和 `branchCount` 并通过运行时切换分支，因此组件状态中不会存储任何内容。

### 组合分支选择器 {#compose-the-branch-picker}

   从 `BranchPickerPrimitive` 构建步进器。基础组件拥有行为（哪个分支是活动的，在末端禁用，当只有一个分支时隐藏）。元素的类赋予它这样的外观。

```tsx
"use client";

import { BranchPickerPrimitive } from "@assistant-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, mono } from "@/components/assistant-ui/elements/surfaces";

export function BranchPicker() {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="flex items-center gap-1"
    >
      <BranchPickerPrimitive.Previous
        aria-label="显示之前的回复"
        className={cn(ghostButton, "size-6")}
      >
        <ChevronLeftIcon className="size-3.5" />
      </BranchPickerPrimitive.Previous>
      <span className={cn(mono, "text-muted-foreground tabular-nums")}>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next
        aria-label="显示下一条回复"
        className={cn(ghostButton, "size-6")}
      >
        <ChevronRightIcon className="size-3.5" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
```

### 放进消息中 {#place-it-in-the-message}

   选择器必须在消息范围内呈现，以便它知道要显示哪个消息的分支。将其放在助手消息的操作行中，复制和重新生成旁边。

```tsx
import { MessagePrimitive } from "@assistant-ui/react";
import { BranchPicker } from "./branch-picker";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts />
      <div className="flex items-center gap-1">
        <BranchPicker />
        {/* copy, regenerate, ... */}
      </div>
    </MessagePrimitive.Root>
  );
}
```

   `Thread` 元素已经为用户和助手消息提供了此组合，因此安装 `@assistant-ui/thread` 即可为你提供分支导航，而无需上述任何内容。

**独立版**

独立版是受控组件：你拥有变体列表和活动索引。它呈现当前变体和步进器，并向你报告索引更改。

### 保持分支状态 {#hold-the-branch-state}

```tsx
"use client";

import { useState } from "react";
import { MessageBranches } from "@/components/assistant-ui/elements/message-branches";

const variants = [
  "巴黎是法国的首都。",
  "法国首都是巴黎，位于塞纳河畔。",
  "法国的首都是巴黎。",
];

export function Answer() {
  const [index, setIndex] = useState(0);
  return (
    <MessageBranches variants={variants} index={index} onIndexChange={setIndex} />
  );
}
```

### 重新生成一个新分支 {#regenerate-into-a-new-branch}

   追加新答案并将索引移至其中。步进器的计数遵循数组长度。

```tsx
async function regenerate() {
  const next = await fetchAnswer();
  setVariants((prev) => [...prev, next]);
  setIndex(variants.length);
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="message-branches">
  <p>{/* the active variant, keyed on index so it fades in on change */}</p>
  <div>
    <button aria-label="显示之前的回复" />
    <span>{/* n / m */}</span>
    <button aria-label="显示下一条回复" />
  </div>
</div>
```

在独立版中，步进器环绕：第一个变体上的前一个变体转到最后一个变体，最后一个变体上的下一个变体转到第一个变体。对于单一变体，两个按钮均呈现禁用状态，计数器读数为 `1 / 1`。如果没有变体，它会读取 `0 / 0`。相反，运行时基础组件在末尾禁用。

## 示例 {#examples}

### 仅步进器 {#stepper-only}

**运行时版**

当消息正文已由 `MessagePrimitive.Parts` 渲染时，仅渲染步进器。 `hideWhenSingleBranch` 将其从布局中删除，直到存在第二个分支，从而保持操作行稳定。

```tsx
<BranchPickerPrimitive.Root hideWhenSingleBranch className="flex items-center gap-1">
  <BranchPickerPrimitive.Previous className={cn(ghostButton, "size-6")}>
    <ChevronLeftIcon className="size-3.5" />
  </BranchPickerPrimitive.Previous>
  <span className={cn(mono, "text-muted-foreground tabular-nums")}>
    <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
  </span>
  <BranchPickerPrimitive.Next className={cn(ghostButton, "size-6")}>
    <ChevronRightIcon className="size-3.5" />
  </BranchPickerPrimitive.Next>
</BranchPickerPrimitive.Root>
```

**独立版**

该元素始终在步进器上方呈现当前变体。要单独显示步进器，请传递变体并从 `variants[index]` 渲染你自己的主体：

```tsx
<div>
  <Markdown>{variants[index]}</Markdown>
  <MessageBranches
    className="[&>p]:hidden"
    variants={variants}
    index={index}
    onIndexChange={setIndex}
  />
</div>
```

### 分支的来源 {#where-branches-come-from}

**运行时版**

重新生成助手消息会创建同级分支并切换到该分支。编辑用户消息会在此时分支对话。只需选择选择器旁边的重新生成按钮即可显示步进器：

```tsx
import { useAui } from "@assistant-ui/react";
import { RefreshCwIcon } from "lucide-react";

function RegenerateButton() {
  const aui = useAui();
  return (
    <button
      type="button"
      aria-label="再生"
      onClick={() => aui.message.reload()}
      className={cn(ghostButton, "size-6")}
    >
      <RefreshCwIcon className="size-3.5" />
    </button>
  );
}
```

对于直接寻址分支的控件，当你持有特定分支的消息 ID 时，`switchToBranch` 与 `{ position: "previous" | "next" }` 一起步进或与 `{ branchId }` 一起跳转。

**独立版**

分支是你附加到 `variants` 的任何内容。重新生成意味着将新答案提取到数组中。 `onIndexChange` 是唯一的写入路径，因此任何使用有效索引调用它的控件都会直接跳转：

```tsx
<select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
  {variants.map((_, i) => (
    <option key={i} value={i}>
      版 {i + 1}
    </option>
  ))}
</select>
```

### 调整步进器 {#restyle-the-stepper}

两种用法都支持通过 `className` 调整根元素。这些按钮使用共享的 `ghostButton` 表面，计数器使用 `surfaces.tsx` 的 `mono` 表面，因此调整这两个标记会调整使用它们的每个元素。

```tsx
<MessageBranches className="max-w-none gap-3" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### BranchPickerPrimitive {#branchpickerprimitive}

| 部分 | 渲染结果 | 说明 |
| ---------- | -------- | ----------------------------------------------------------------------------------------------- |
| `Root` | `div` | `hideWhenSingleBranch` 返回 `null`，而 `branchCount <= 1`。必须在消息范围内。 |
| `Previous` | `button` | 在第一个分支上禁用。接受 `asChild`。 |
| `Next` | `button` | 在最后一个分支上禁用。接受 `asChild`。 |
| `Number` | 文字 | 基于 1 的 `branchNumber`。 |
| `Count` | 文字 | `branchCount`。 |

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `s.message.branchNumber` | `number` | 显示的分支的基于 1 的索引。 |
| `s.message.branchCount` | `number` | 此消息的同级分支数。 |
| `aui.message.switchToBranch(options)` | `{ position?: "previous" \| "next"; branchId?: string }` | 切换所示分支。`position` 步，`branchId` 跳转到你持有其消息 id 的分支。 |

**独立版**

### MessageBranches {#messagebranches}

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `variants` | `readonly string[]` |  | 兄弟姐妹按顺序回答。 |
| `index` | `number` |  | 要显示的变体的索引。超出范围的索引会退回到第一个变体。 |
| `onIndexChange` | `(index: number) => void` |  | 当按下步进按钮时调用下一个索引。两端缠绕。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
