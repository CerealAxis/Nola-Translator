---
title: Edit a sent message（编辑已发送消息）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Edit a sent message（编辑已发送消息）

就地编辑已发送消息，并在保存前提示会移除多少条后续回复。

发送的气泡变成一个小的输入框：重写它，并发出警告，指出发送编辑的回复将被丢弃。使用运行时，编辑会在自己的编辑器中打开相同的消息，并在发送时分叉一个新分支。在独立版中，你可以自己保存值、编辑标志和警告计数。

<demo react="assistant-ui/edit-a-sent-message-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-edit-message"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-edit-message.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`s.message.composer.isEditing` 在按下 `ActionBarPrimitive.Edit` 的瞬间翻转为真。当气泡真实时，渲染编辑输入框来代替气泡。

### 从气泡中触发编辑 {#trigger-editing-from-the-bubble}

```tsx
"use client";

import { ActionBarPrimitive, MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { PencilLineIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, ghostButton } from "@/components/assistant-ui/elements/surfaces";

export function UserTurn() {
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  return (
    <MessagePrimitive.Root className="flex w-full max-w-sm flex-col items-end gap-1">
      {isEditing ? (
        <EditComposer />
      ) : (
        <div className={cn(field, "flex items-center gap-2 rounded-2xl px-3.5 py-2.5")}>
          <MessagePrimitive.Parts />
          <ActionBarPrimitive.Edit aria-label="编辑留言" className={cn(ghostButton, "size-6 shrink-0")}>
            <PencilLineIcon className="size-3.5" />
          </ActionBarPrimitive.Edit>
        </div>
      )}
    </MessagePrimitive.Root>
  );
}
```

### 渲染编辑输入框 {#render-the-edit-composer}

   在正在编辑的消息内，`ComposerPrimitive.*` 将自身范围限定为该消息自己的输入框而不是会话的输入框。

```tsx
import { ComposerPrimitive } from "@assistant-ui/react";

function EditComposer() {
  return (
    <ComposerPrimitive.Root className={cn(field, "flex w-full flex-col gap-3 rounded-2xl p-3.5")}>
      <ComposerPrimitive.Input rows={2} autoFocus className="resize-none bg-transparent px-3 py-2.5 text-[13.5px] outline-none" />
      <div className="flex items-center justify-end gap-2">
        <ComposerPrimitive.Cancel className="h-8 rounded-full px-3.5 text-xs font-medium">
          取消
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="bg-foreground text-background h-8 rounded-full px-3.5 text-xs font-medium">
          发送
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
```

   `Thread` 已经为用户和助手消息提供了这种精确的交换，没有下面涵盖的丢弃警告。安装 `@assistant-ui/thread` 以获得完整的组合。

**独立版**

独立的 `EditMessage` 是一个受控组件：气泡调用 `onStartEdit`，而当 `editing` 为 true 时，它​​会呈现一个文本区域以及“取消”和“发送”。

### 保持编辑状态 {#hold-the-edit-state}

```tsx
"use client";

import { useState } from "react";
import { EditMessage } from "@/components/assistant-ui/elements/edit-message";

export function Turn() {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("What's the capital of France?");

  return (
    <EditMessage
      value={value}
      discardedReplies={2}
      editing={editing}
      onValueChange={setValue}
      onStartEdit={() => setEditing(true)}
      onCancel={() => setEditing(false)}
      onSave={async () => {
        await resend(value);
        setEditing(false);
      }}
    />
  );
}
```

### 自己计算`discardedReplies` {#compute-discardedreplies-yourself}

   元素只渲染你传递的数字。在渲染之前，以你自己的转录状态计算此消息后面的回复。

## 结构 {#anatomy}

```tsx
<div data-slot="edit-message">
  <button>{/* the sent bubble; click to start editing */}</button>
</div>
```

编辑时，同一个槽会呈现不同的形状：

```tsx
<div data-slot="edit-message">
  <textarea />
  <div>{/* "sending discards N replies", only when discardedReplies > 0 */}</div>
  <div>
    <button>取消</button>
    <button>发送</button>
  </div>
</div>
```

独立版中，`discardedReplies` 是你提供的普通数字，可以定义你的应用程序模型删除方式。在运行时，编辑不会删除任何内容：发送调用消息的编辑编辑器的 `send()`，它将重写作为原始消息的新同级添加到同一父级下，就像重新加载助手消息一样。原始消息及其下的所有内容都保留在会话的历史记录中，可以通过分支选择器的 `n / m` 步进器再次访问，因此不会丢弃任何内容。这些消息仅在显示的分支之外。如果你想要相同的预先警告，请计算将退出视图的计数：助手在当前显示的分支上的此消息之后回复。

## 示例 {#examples}

### 计算警告提示中的数量 {#compute-the-warning-count}

**运行时版**

`s.message.index` 是该消息在当前显示分支中的位置。它之后停止显示的所有内容都是 `s.thread.messages.slice(s.message.index + 1)`。

```tsx
const discardedReplies = useAuiState(
  (s) => s.thread.messages.slice(s.message.index + 1).filter((m) => m.role === "assistant").length,
);
```

**独立版**

没有可从中得出的文字记录。传递与你的应用程序处理重新发送的方式相匹配的计数。如果你的应用程序删除了后来的回复，则计数是字面的。

### 取消编辑时丢弃草稿 {#cancel-drops-the-draft-not-the-branch}

**运行时版**

`ComposerPrimitive.Cancel` 调用编辑器的 `cancel()`，它会丢弃正在进行的编辑文本并将 `isEditing` 翻转回 false。原始消息未受影响，因为没有发送任何内容。

**独立版**

`onCancel` 应该做同样的事情：将 `value` 重置为原始文本（或将 `editing` 翻转回 false 并让父级重新播种），而不触及消息列表所保存的内容。

### 调整输入框样式 {#restyle-the-composer}

两种用法都支持通过 `className` 调整根元素。气泡和文本区域读取 `field` 标记，编辑根读取 `paper`，两者都来自 `surfaces.tsx`。

```tsx
<EditMessage className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### ActionBarPrimitive 和 ComposerPrimitive {#actionbarprimitive-and-composerprimitive}

| 部分 | 渲染结果 | 说明 |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `ActionBarPrimitive.Edit` | `button` | 调用 `aui.composer.beginEdit()` 获取此消息。已经编辑时禁用。 |
| `ComposerPrimitive.Root` | `form` | 在编辑消息内呈现时，范围为消息的编辑编辑器。 |
| `ComposerPrimitive.Input` | `textarea` | 可编辑文本。 |
| `ComposerPrimitive.Cancel` | `button` | 放弃编辑并退出编辑模式。 |
| `ComposerPrimitive.Send` | `button` | 将编辑作为新的同级分支发送。当文本为空时禁用。 |

### 消息与输入框状态 {#message-and-composer-state}

| 选择器 | 类型 | 说明 |
| ------------------------------ | ------------------------- | ---------------------------------------------------------- |
| `s.message.composer.isEditing` | `boolean` | 该消息当前是否正在编辑。 |
| `s.message.index` | `number` | 该消息在当前显示的分支中的位置。 |
| `s.thread.messages` | `readonly MessageState[]` | 完整显示的分支（按顺序）。 |

**独立版**

### EditMessage {#editmessage}

| 属性 | 类型 | 默认值 | 说明 |
| ------------------ | ------------------------- | -------- | ----------------------------------------------- |
| `value` | `string` |  | 编辑文本区域中的文本。 |
| `discardedReplies` | `number` |  | 当大于 `0` 时显示在警告行中。 |
| `editing` | `boolean` |  | 在气泡和输入框之间切换。 |
| `onValueChange` | `(value: string) => void` |  | 当文本区域改变时调用。 |
| `onSave` | `() => void` |  | 按下“发送”时调用。 |
| `onCancel` | `() => void` |  | 当按下取消键时调用。 |
| `onStartEdit` | `() => void` |  | 单击气泡时调用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
