---
title: Launcher（启动器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Launcher（启动器）

将聊天入口折叠为浮动按钮，打开后展示建议和开始操作。

<demo react="assistant-ui/launcher-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-launcher-bubble"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-launcher-bubble.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 把建议和开始操作连接到运行时

把建议连接到运行时编辑器，把开始按钮连接到创建或打开会话。

```tsx
"use client";

import { useState } from "react";
import { ComposerPrimitive, ThreadPrimitive, useAuiEvent } from "@assistant-ui/react";
import { MessageCircleIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, floating, inkButton, mono } from "@/components/assistant-ui/elements/surfaces";

const PROMPTS = ["总结此页面", "查找队友", "报告问题"];

export function Launcher() {
  const [open, setOpen] = useState(false);

  // 应用侧处理
  useAuiEvent("thread.runStart", () => setOpen(true));

  return (
    <div className="flex w-full max-w-[19rem] flex-col items-end gap-2.5">
      {open && (
        <div className={cn(floating, "flex w-full flex-col gap-3 rounded-[20px] p-4")}>
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-medium">有什么可以帮你？</span>
            <span className={cn(mono, "text-muted-foreground")}>通常在一分钟内回复</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {PROMPTS.map((prompt) => (
              <ThreadPrimitive.Suggestion
                key={prompt}
                prompt={prompt}
                className={cn(
                  field,
                  "hover:bg-foreground/[0.07] text-foreground/70 rounded-xl px-3 py-2 text-start text-[13px] transition-colors",
                )}
              >
                {prompt}
              </ThreadPrimitive.Suggestion>
            ))}
          </div>

          <ComposerPrimitive.Send
            className={cn(inkButton, "flex h-8 items-center justify-center rounded-full text-xs font-medium")}
          >
            开始会话
          </ComposerPrimitive.Send>
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "关闭助手" : "打开助手"}
        onClick={() => setOpen((o) => !o)}
        className={cn(inkButton, "flex size-12 items-center justify-center rounded-full")}
      >
        {open ? <XIcon className="size-5" /> : <MessageCircleIcon className="size-5" />}
      </button>
    </div>
  );
}
```

**独立使用**

### 保存打开状态与建议列表

独立版持有打开状态和建议列表，提供切换和启动回调。

```tsx
"use client";

import { useState } from "react";
import { LauncherBubble } from "@/components/assistant-ui/elements/launcher-bubble";

const prompts = ["重置密码", "联系人工", "我的订单到哪里了？"];

export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(2);

  return (
    <LauncherBubble
      open={open}
      unread={unread}
      greeting="你好，需要帮忙吗？"
      prompts={prompts}
      onToggle={() => {
        setOpen((o) => !o);
        setUnread(0);
      }}
      onPick={(prompt) => console.log("picked", prompt)}
      onStart={() => console.log("start")}
    />
  );
}
```

## 结构 {#anatomy}

收起时显示启动按钮，展开后出现标题、建议和开始操作。

```tsx
<div data-slot="launcher-bubble">
  {/* 对应槽位内容 */}
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* "通常在一分钟内回复" */}</span>
    <div>
      {/* 逐项渲染 */}
    </div>
    {onStart && <button>{/* "开始会话" */}</button>}
  </div>
  {onToggle ? (
    <button aria-expanded aria-label="打开助手或关闭助手">
      {/* 对应槽位内容 */}
      <span>{/* 对应槽位内容 */}</span>
    </button>
  ) : !open ? (
    <div>{/* 区分当前选中项 */}</div>
  ) : null}
</div>
```

面板只在 `open` 为 true 时挂载，关闭时直接移除。打开、建议和开始等操作是否可用，取决于对应回调是否传入。

## 示例 {#examples}

### 调整面板与按钮样式

在对应槽位应用 `className`。

```tsx
<LauncherBubble className="max-w-xs" /* ... */ />
```

### 给收起按钮加徽标

传入未读或提醒数量，在关闭时显示。

## API 参考 {#api-reference}

**使用运行时**

`ThreadPrimitive.Suggestion` 和 `ComposerPrimitive.Send` 负责建议与发送。展开、关闭和未读计数由调用方保存。

### 所用会话事件

| 事件 | Payload | 说明 |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thread.runStart` | `{ threadId: string }` | 会话开始一次运行时触发的事件。 |

**独立使用**

### LauncherBubble

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `open` | `boolean` | 必填 | 控制内容是否展开。 |
| `unread` | `number` | 必填 | 收起的启动器上显示的未读数。 |
| `greeting` | `string` | 必填 | 打开启动器后显示的欢迎语。 |
| `prompts` | `readonly string[]` | 必填 | 可选择的提示词。 |
| `onToggle` | `() => void` |  | 切换时调用。 |
| `onPick` | `(prompt: string) => void` |  | 选择建议提示词时调用。 |
| `onStart` | `() => void` |  | 用户开始会话时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
