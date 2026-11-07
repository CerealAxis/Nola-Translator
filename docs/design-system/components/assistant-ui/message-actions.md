---
title: Message actions（消息操作）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Message actions（消息操作）

提供复制、评价和重新生成操作，并即时反馈操作结果。

助手回复下方的操作行：复制、竖起大拇指或向下、重新生成以及一个包罗万象的更多按钮。每个动作都确认其自己的结果，而不是通过祝酒：复制交换到复选标记，填写评级，在运行时重新生成旋转。在运行时，每个按钮都会直接调用会话。在独立版中，你保存每个按钮反映的状态及其触发的回调。

<demo react="assistant-ui/message-actions-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-message-actions"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-message-actions.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`ActionBarPrimitive` 为每个操作提供一个按钮，每个按钮都已连接到它在内部呈现的消息，并在操作停止可用时禁用。

### 组合操作栏 {#compose-the-row}

```tsx
"use client";

import { ActionBarPrimitive, AuiIf } from "@assistant-ui/react";
import {
  CheckIcon,
  CopyIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton } from "@/components/assistant-ui/elements/surfaces";

export function MessageActions() {
  const buttonClassName = cn(ghostButton, "size-7");

  return (
    <ActionBarPrimitive.Root className="flex items-center gap-1">
      <ActionBarPrimitive.Copy aria-label="复制回复" className={buttonClassName}>
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="size-3.5" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="size-3.5" />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.FeedbackPositive aria-label="标记回复有帮助" className={buttonClassName}>
        <ThumbsUpIcon className="size-3.5" />
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative aria-label="标记回复无帮助" className={buttonClassName}>
        <ThumbsDownIcon className="size-3.5" />
      </ActionBarPrimitive.FeedbackNegative>
      <ActionBarPrimitive.Reload aria-label="重新生成响应" className={buttonClassName}>
        <RefreshCwIcon className="size-3.5" />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}
```

   `ActionBarPrimitive.Copy` 在成功复制后将 `data-copied="true"` 设置三秒（用 `copiedDuration` 进行调整），一旦 `s.message.metadata.submittedFeedback` 匹配，`ActionBarPrimitive.FeedbackPositive`/`FeedbackNegative` 将设置 `data-submitted="true"`。设置这些属性的样式，而不是保留你自己的布尔值。

### 添加更多菜单 {#add-a-more-menu}

   `ActionBarMorePrimitive` 是范围相同消息的基数下拉菜单。`ActionBarPrimitive.ExportMarkdown`是它的现成物品。

```tsx
import { ActionBarMorePrimitive, ActionBarPrimitive } from "@assistant-ui/react";
import { DownloadIcon, EllipsisIcon } from "lucide-react";

<ActionBarMorePrimitive.Root>
  <ActionBarMorePrimitive.Trigger aria-label="更多响应动作" className={buttonClassName}>
    <EllipsisIcon className="size-3.5" />
  </ActionBarMorePrimitive.Trigger>
  <ActionBarMorePrimitive.Content side="bottom" align="start" className="bg-popover rounded-xl border p-1.5">
    <ActionBarPrimitive.ExportMarkdown asChild>
      <ActionBarMorePrimitive.Item className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm">
        <DownloadIcon className="size-4" />
        导出为 Markdown
      </ActionBarMorePrimitive.Item>
    </ActionBarPrimitive.ExportMarkdown>
  </ActionBarMorePrimitive.Content>
</ActionBarMorePrimitive.Root>
```

   `Thread` 元素在每个助手消息上提供复制、重新加载和更多菜单。仅当 `s.thread.capabilities.feedback` 为 true 时才渲染 `FeedbackPositive`/`FeedbackNegative`。

**独立版**

独立版中，`MessageActions` 完全受控：五个回调和决定每个按钮当前外观的状态片段。

### 维护操作栏状态 {#hold-the-rows-state}

   从注册表安装复制钩子：

```sh
npx shadcn@latest add "@assistant-ui/use-copy-to-clipboard"
```

```tsx
"use client";

import { useState } from "react";
import { MessageActions, type Reaction } from "@/components/assistant-ui/elements/message-actions";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export function Reply() {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const [reaction, setReaction] = useState<Reaction>(null);
  const [regenerating, setRegenerating] = useState(false);

  return (
    <MessageActions
      copied={isCopied}
      reaction={reaction}
      regenerating={regenerating}
      onCopy={() => copyToClipboard("...")}
      onReactionChange={setReaction}
      onRegenerate={async () => {
        setRegenerating(true);
        await regenerate();
        setRegenerating(false);
      }}
      onMore={() => {}}
    />
  );
}
```

### 从 `onMore` 打开你自己的菜单 {#open-your-own-menu-from-onmore}

   `onMore` 单击时触发，没有附加内置菜单。调用时从你自己的组件树中打开弹出窗口或下拉菜单。

## 结构 {#anatomy}

```tsx
<div data-slot="message-actions">
  <button aria-label="复制回复" />
  <button aria-label="标记回复有帮助" aria-pressed={false} />
  <button aria-label="标记回复无帮助" aria-pressed={false} />
  <button aria-label="重新生成响应" />
  <button aria-label="更多响应动作" />
</div>
```

在独立版中，两个评级按钮是 `aria-pressed` 切换且互斥：再次按下活动按钮会调用 `onReactionChange(null)` 将其清除，然后按下其他开关直接切换。复制按钮交换其图标（`iconSwap`/`iconSwapIn`/`iconSwapOut`），呈翠绿色，并将其标签更改为 `Copied response`，而 `copied` 为 true。当 `regenerating` 为 true 时，重新生成图标会旋转。在运行时，`ActionBarPrimitive.FeedbackPositive`/`FeedbackNegative` 也是 `aria-pressed` 切换并且互斥（在 `s.message.metadata.submittedFeedback` 中提交一个会替换另一个），但尚不清楚：`MessageMethods.submitFeedback` 只写入一个反应，因此一旦提交一条消息，就没有像独立切换那样返回“无反应”的内置路径。

## 示例 {#examples}

### 复制确认 {#copy-confirmation}

**运行时版**

复制的状态及其计时器位于 `ActionBarPrimitive.Copy` 内。没有什么需要你重置的。如果你需要在该行的其他地方进行相同的确认，请直接读取 `s.message.isCopied`。

```tsx
const isCopied = useAuiState((s) => s.message.isCopied);
```

**独立版**

复制的状态及其计时器位于 `useCopyToClipboard` 内。没有什么需要你重置的。仅当剪贴板写入成功后，`isCopied` 才会变为 true，并在最新成功复制后保持 true 3 秒（使用 `useCopyToClipboard({ copiedDuration })` 进行调整）。

### 调整操作栏样式 {#restyle-the-row}

两种用法都支持通过 `className` 调整根元素，图标交换标记（`iconSwap`、`iconSwapIn`、`iconSwapOut`）和 `surfaces.tsx` 中的 `ghostButton` 覆盖复制过渡和每个按钮的悬停状态。

```tsx
<MessageActions className="gap-2" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### ActionBarPrimitive 和 ActionBarMorePrimitive {#actionbarprimitive-and-actionbarmoreprimitive}

| 部分 | 渲染结果 | 说明 |
| ---------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionBarPrimitive.Root` | `div` | `hideWhenRunning`、`autohide` 和 `autohideFloat` 控制可见性。未设置，该行始终呈现。 |
| `ActionBarPrimitive.Copy` | `button` | 一旦没有文本可供复制，则禁用。 `copiedDuration`（默认 `3000`）控制 `data-copied` 保持设置的时间。 |
| `ActionBarPrimitive.FeedbackPositive` | `button` | 调用 `aui.message.submitFeedback({ type: "positive" })`。 |
| `ActionBarPrimitive.FeedbackNegative` | `button` | 调用 `aui.message.submitFeedback({ type: "negative" })`。 |
| `ActionBarPrimitive.Reload` | `button` | 会话正在运行时禁用、禁用或消息不是来自助手。 |
| `ActionBarPrimitive.ExportMarkdown` | `button` | 将消息下载为 Markdown 文件，或者传递时将内容交给 `onExport`。用 `asChild` 将 `ActionBarMorePrimitive.Item` 包裹在其中。 |
| `ActionBarMorePrimitive.Root` | 仅上下文 | 范围为操作栏交互锁的基数 `DropdownMenu.Root`。 |
| `ActionBarMorePrimitive.Trigger` / `.Content` / `.Item` / `.Separator` | 按钮/div/div/div | 标准下拉菜单部件。 |

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `s.message.isCopied` | `boolean` | `ActionBarPrimitive.Copy` 成功后 `copiedDuration` 为真。 |
| `s.message.metadata.submittedFeedback?.type` | `"positive" \| "negative" \| undefined` | 为此消息提交的最后反馈（如果有）。 |
| `aui.message.submitFeedback({ type })` | `(feedback: { type: "positive" \| "negative"; comment?: string }) => void` | 记录反应。没有办法清除它。 |
| `aui.message.reload(config?)` | `(config?: { runConfig?: RunConfig }) => void` | 重新生成此辅助消息作为新的同级分支。 |

**独立版**

### MessageActions {#messageactions}

| 属性 | 类型 | 默认值 | 说明 |
| ------------------ | -------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `copied` | `boolean` |  | 在复制按钮上显示复选标记和翠绿色调。 |
| `reaction` | `"up" \| "down" \| null` |  | 哪个评级按钮（如果有）按下时显示。 |
| `regenerating` | `boolean` |  | 旋转重新生成图标。 |
| `onCopy` | `() => void` |  | 按下复制按钮时调用。 |
| `onReactionChange` | `(reaction: "up" \| "down" \| null) => void` |  | 调用下一个反应。当再次按下活动按钮时，`null`。 |
| `onRegenerate` | `() => void` |  | 按下重新生成按钮时调用。 |
| `onMore` | `() => void` |  | 当按下更多按钮时调用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
