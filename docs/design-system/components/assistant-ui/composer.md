---
title: Composer（消息编辑器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Composer（消息编辑器）

将输入框、工具区、附件和发送操作组合成消息编辑器。

<demo react="assistant-ui/composer-demo.tsx" />

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

### 组合编辑栏

通过 `ComposerPrimitive.Root`、Input 和 Send 连接运行时的草稿与发送。

```tsx
"use client";

import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, inkButton, paper } from "@/components/assistant-ui/elements/surfaces";

export function ComposerBar() {
  return (
    <ComposerPrimitive.Root className={cn(paper, "flex w-full max-w-lg flex-col gap-2 rounded-[24px] p-2.5")}>
      <ComposerPrimitive.Input
        placeholder="输入消息…"
        rows={1}
        className="placeholder:text-muted-foreground min-h-11 w-full resize-none bg-transparent px-3 text-[15px] outline-none"
      />
      <div className="flex items-center justify-between">
        <ComposerPrimitive.AddAttachment
          aria-label="添加附件"
          className={cn(ghostButton, "size-8 disabled:pointer-events-none disabled:opacity-30")}
        >
          <PlusIcon className="size-4" />
        </ComposerPrimitive.AddAttachment>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send
            aria-label="发送消息"
            className={cn(inkButton, "grid size-8 place-items-center rounded-full")}
          >
            <ArrowUpIcon className="size-4" />
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel
            aria-label="停止生成"
            className={cn(inkButton, "grid size-8 place-items-center rounded-full")}
          >
            <SquareIcon className="size-3 fill-current" />
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </ComposerPrimitive.Root>
  );
}
```

### 按需添加其他控件

按需加入附件、取消发送、模型选择和其他工具。

**独立使用**

### 保存编辑器状态

独立版把文本与运行状态保存在应用，连接相应的更新和提交回调。

```tsx
"use client";

import { useState } from "react";
import { Composer, ComposerBar, ComposerInput, ComposerToolbar, ComposerActions, ComposerAttachButton, ComposerSend } from "@/components/assistant-ui/elements/composer";

export function ChatBox() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = () => {
    if (!text.trim()) return;
    setSending(true);
    submitMessage(text).finally(() => setSending(false));
    setText("");
  };

  return (
    <Composer>
      <ComposerBar>
        <ComposerInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmit={send}
          placeholder="输入消息…"
        />
        <ComposerToolbar>
          <ComposerAttachButton onClick={() => addAttachment()} />
          <ComposerActions>
            <ComposerSend streaming={sending} idle={text.trim().length === 0} onClick={send} />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  );
}
```

### 使用工具栏内置行为

用 `ComposerToolbar` 和 `ComposerActions` 安排控件，也可按需拆开使用子组件。

## 结构 {#anatomy}

编辑器由 Composer、`ComposerBar`、`ComposerInput` 与底部工具和操作区组成，可按场景添加附件和其他入口。

```tsx
<div data-slot="composer">
  <div data-slot="composer-bar" data-drag-active={/* 在对应状态下为 true */}>
    <div data-slot="composer-attachments">{/* 对应槽位内容 */}</div>
    <input data-slot="composer-input" />
    <div data-slot="composer-toolbar">
      <button data-slot="composer-attach" />
      <div data-slot="composer-actions">
        {/* 操作控件 */}
        <button data-slot="composer-send" />
      </div>
    </div>
  </div>
</div>
```

`ComposerBar` 使用 `dragActive` 表示拖放目标。`ComposerSend` 根据 `streaming` 和 `idle` 决定图标和外观。其余控件的组合由调用方决定。

## 示例 {#examples}

### 发送按钮切换为取消按钮

根据 `isRunning` 切换发送与取消，并分别连接对应回调。

**使用运行时**

```tsx
<ComposerActions>
  <AuiIf condition={(s) => !s.thread.isRunning}>
    <ComposerPrimitive.Send className={cn(inkButton, "grid size-8 place-items-center rounded-full")}>
      <ArrowUpIcon className="size-4" />
    </ComposerPrimitive.Send>
  </AuiIf>
  <AuiIf condition={(s) => s.thread.isRunning}>
    <ComposerPrimitive.Cancel className={cn(inkButton, "grid size-8 place-items-center rounded-full")}>
      <SquareIcon className="size-3 fill-current" />
    </ComposerPrimitive.Cancel>
  </AuiIf>
</ComposerActions>
```

**独立使用**

```tsx
<ComposerActions>
  <ComposerSend streaming={isSending} idle={text.length === 0} onClick={isSending ? cancel : send} />
</ComposerActions>
```

### 调整编辑栏样式

使用 `className` 调整编辑器和相应的布局槽位。

```tsx
<ComposerBar className="max-w-2xl rounded-2xl p-4" />
```

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive

| 组成部分 | Renders | 说明 |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Root` | `form` | 建立相应组件的上下文并包住其子组件。 |
| `Input` | auto-resizing `textarea` | 绑定当前草稿的输入区。 |
| `Send` | `button` | 发送当前草稿。 |
| `Cancel` | `button` | 停止当前运行。 |
| `AddAttachment` | `button` | 打开选择文件的入口。 |
| `AttachmentDropzone` | `div` (or `asChild`) | 将拖入的文件交给附件适配器。 |

### 编辑器状态

| 选择器 | 类型 | 说明 |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `s.composer.text` | `string` | 当前编辑器草稿。 |
| `s.composer.isEmpty` | `boolean` | 编辑器中是否没有可发送的内容。 |
| `s.composer.canSend` | `boolean` | 当前是否可发送。 |
| `s.composer.canCancel` | `boolean` | 当前是否可取消。 |
| `s.composer.attachments` | `readonly Attachment[]` | 草稿附件列表。 |
| `s.thread.isRunning` | `boolean` | 当前会话是否正在运行。 |
| `aui.composer.send(options?)` | `(options?: { startRun?: boolean; steer?: boolean }) => void` | 发送编辑器中的内容。 |
| `aui.composer.cancel()` | `() => void` | 停止当前生成。 |

**独立使用**

### Composer

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------- | ------- | --------------------------- |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### ComposerBar

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | --------- | ------- | ----------------------------------------------------------- |
| `dragActive` | `boolean` | `false` | 是否正将文件拖入编辑器。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### ComposerInput

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `onSubmit` | `() => void` |  | 用户提交编辑内容时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `input` 属性会转发给根元素。

### ComposerToolbar / ComposerActions

`Composer` 和 `ComposerBar` 会转发其余 `div` 属性，`ComposerInput` 转发其余 `input` 属性。`ComposerToolbar` 与 `ComposerActions` 使用 `div` 横向排列子组件，并转发该元素的属性。

### ComposerAttachButton

| 属性 | 类型 | 默认值 | 说明 |
| --------- | ------------ | ------- | --------------------------------------------------------------------------- |
| `onClick` | `() => void` |  | 点击时调用。 |

### ComposerSend

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `streaming` | `boolean` | 必填 | 是否正在流式回复。 |
| `idle` | `boolean` | 必填 | 空闲时显示的内容。 |
