---
title: Mobile composer（移动端消息编辑器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Mobile composer（移动端消息编辑器）

在移动端展示紧凑的编辑栏，提供附件、发送和运行控制。

<demo react="assistant-ui/mobile-composer-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-mobile-composer"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-mobile-composer.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 用编辑器基础组件组合输入栏

通过 `ComposerPrimitive` 连接运行时输入与发送，再把操作放到适合触控的位置。

```tsx
"use client";

import { ArrowUpIcon, MicIcon, PlusIcon, SquareIcon } from "lucide-react";
import { ComposerPrimitive, ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { field, ghostButton, inkButton, mono } from "@/components/assistant-ui/elements/surfaces";

const ACTIONS = ["总结", "翻译", "解释"];

export function MobileComposerBar({ keyboardOpen }: { keyboardOpen: boolean }) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);

  return (
    <ComposerPrimitive.Root
      className={cn(
        "bg-background border-foreground/[0.07] flex w-full max-w-[19rem] flex-col gap-2.5 rounded-t-[20px] border-t px-3 pt-3",
        keyboardOpen ? "pb-3" : "pb-6",
      )}
    >
      {!keyboardOpen && (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
          {ACTIONS.map((action) => (
            <ThreadPrimitive.Suggestion
              key={action}
              prompt={action}
              className={cn(field, "text-foreground/60 shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap")}
            >
              {action}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <ComposerPrimitive.AddAttachment className={cn(ghostButton, field, "size-9 shrink-0")}>
          <PlusIcon className="size-4" />
        </ComposerPrimitive.AddAttachment>

        <div className={cn(field, "flex min-w-0 flex-1 items-center gap-2 rounded-[18px] px-3 py-2")}>
          <ComposerPrimitive.Input
            placeholder="消息"
            className="text-foreground/85 placeholder:text-muted-foreground min-w-0 flex-1 resize-none bg-transparent text-[16px] outline-none"
          />
          {isEmpty && <MicIcon className="text-muted-foreground size-4 shrink-0" />}
        </div>

        {isRunning ? (
          <ComposerPrimitive.Cancel className={cn(inkButton, "flex size-9 shrink-0 items-center justify-center rounded-full")}>
            <SquareIcon className="size-3 fill-current" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send className={cn(inkButton, "flex size-9 shrink-0 items-center justify-center rounded-full")}>
            <ArrowUpIcon className="size-4" />
          </ComposerPrimitive.Send>
        )}
      </div>

      {!keyboardOpen ? (
        <span aria-hidden className="bg-foreground/15 mx-auto h-1 w-28 rounded-full" />
      ) : (
        <span className={cn(mono, "text-muted-foreground text-center")}>按回车发送</span>
      )}
    </ComposerPrimitive.Root>
  );
}
```

**独立使用**

### 保存编辑器状态

独立版保存输入文本和运行状态，并把附件和发送连接到应用回调。

```tsx
"use client";

import { useState } from "react";
import { MobileComposer } from "@/components/assistant-ui/elements/mobile-composer";

export function MobileBar() {
  const [value, setValue] = useState("");
  const [running, setRunning] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  return (
    <MobileComposer
      value={value}
      keyboardOpen={keyboardOpen}
      running={running}
      actions={["总结", "翻译", "解释"]}
      onAction={(action) => setValue(action)}
      onAttach={() => console.log("attach")}
      onValueChange={setValue}
      onSend={() => {
        setRunning(true);
        setValue("");
      }}
      onStop={() => setRunning(false)}
      onFocus={() => setKeyboardOpen(true)}
    />
  );
}
```

## 结构 {#anatomy}

布局组合附件按钮、输入框与发送区，可根据运行状态切换操作。

```tsx
<div data-slot="mobile-composer">
  {/* 操作控件 */}
  <div>{/* 逐项渲染 */}</div>
  <div>
    <button aria-label="添加附件" />
    <input aria-label="消息" placeholder="消息" />
    {/* 对应槽位内容 */}
    <button aria-label="停止或发送" />
  </div>
  {/* 对应槽位内容 */}
</div>
```

独立版使用单行 `input`，运行时的 `ComposerPrimitive.Input` 可随文本增高。回复生成时回车不会发送，按钮切换为停止。空草稿时禁用发送。

## 示例 {#examples}

### 调整编辑栏样式

为根元素传入 `className`，按宿主的可用空间布置。

```tsx
<MobileComposer className="max-w-xs" /* ... */ />
```

### 连接感知键盘的布局

由宿主处理键盘与视口尺寸，保持输入区在可见区域。

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive

| 组成部分 | Renders | 说明 |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Root` | `form` | 建立相应组件的上下文并包住其子组件。 |
| `Input` | `textarea` (auto-resizing) | 绑定当前草稿的输入区。 |
| `AddAttachment` | `button` | 打开选择文件的入口。 |
| `Send` | `button` | 发送当前草稿。 |
| `Cancel` | `button` | 停止当前运行。 |

快捷建议使用 `ThreadPrimitive.Suggestion`，与[启动气泡](/vis/components/assistant-ui/launcher)相同。默认替换草稿内容，是否立即发送取决于应用配置。

### 会话和编辑器状态

| 选择器 | 类型 | 说明 |
| -------------------- | --------- | ------------------------------------------------------- |
| `s.thread.isRunning` | `boolean` | 当前会话是否正在运行。 |
| `s.composer.isEmpty` | `boolean` | 编辑器中是否没有可发送的内容。 |

**独立使用**

### MobileComposer

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value` | `string` | 必填 | 当前值。 |
| `keyboardOpen` | `boolean` | 必填 | 屏幕键盘是否已打开。 |
| `running` | `boolean` | 必填 | 是否正在生成回复。 |
| `actions` | `readonly string[]` | 必填 | 键盘收起时可显示的快捷操作。 |
| `onAction` | `(action: string) => void` |  | 用户选择快捷操作时调用。 |
| `onAttach` | `() => void` |  | 用户添加附件时调用。 |
| `onValueChange` | `(value: string) => void` |  | 编辑器内容变化时调用。 |
| `onSend` | `() => void` |  | 用户发送时调用。 |
| `onStop` | `() => void` |  | 用户停止回复时调用。 |
| `onFocus` | `() => void` |  | 编辑器获得焦点时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
