---
title: Tooltip icon button（带提示的图标按钮）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Tooltip icon button（带提示的图标按钮）

图标按钮搭配文字提示，适用于消息操作栏等紧凑界面。

<demo react="assistant-ui/tooltip-icon-button-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/tooltip-icon-button"
```

## 快速开始 {#getting-started}

可以将提示按钮与 assistant-ui primitive 组合，也可以独立放在普通工具栏。

### 与 primitive 组合 {#compose-it-with-a-primitive}

通过 primitive 的渲染入口使用图标按钮，保留原操作及其状态。

```tsx
"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";

function ScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={<TooltipIconButton tooltip="滚动到底部" variant="outline" />}
    >
      <ArrowDownIcon />
    </ThreadPrimitive.ScrollToBottom>
  );
}
```

### 安装已接线的套件组件 {#install-a-kit-element-for-it-pre-wired}

套件的消息操作等组件已经将图标按钮与运行时操作接好。

### 作为普通图标按钮使用 {#use-it-like-any-icon-button}

传入图标、操作回调和可读提示，让图标按钮有明确名称。

```tsx
"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";

export function GenerateButton() {
  const [busy, setBusy] = useState(false);
  return (
    <TooltipIconButton
      tooltip="Generate"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await generate();
        setBusy(false);
      }}
    >
      <SparklesIcon />
    </TooltipIconButton>
  );
}
```

## 结构 {#anatomy}

按钮是提示的触发器，提示内容说明操作。图标保持紧凑。

```tsx
<button data-slot="button">
  {/* the icon you pass as children */}
  <span className="sr-only">{/* tooltip text, as the accessible name */}</span>
</button>
```

## 示例 {#examples}

保持按钮交互，同时按使用位置选择按钮属性和外观。

### 保留 Button 属性 {#every-prop-button-takes-still-works}

可以使用 `Button` 支持的禁用、点击回调、尺寸和变体等属性。

```tsx
<TooltipIconButton tooltip="Delete" variant="destructive">
  <TrashIcon />
</TooltipIconButton>
```

### 调整按钮样式 {#restyle-the-button}

通过变体、尺寸和 `className` 调整按钮，提示继续由同一触发器管理。

```tsx
<TooltipIconButton tooltip="Copy" className="size-8">
  <CopyIcon />
</TooltipIconButton>
```

## API 参考 {#api-reference}

组件沿用按钮属性，并增加提示相关设置。

### 组合位置 {#composition-sites}

可放在消息操作栏、输入区、独立工具栏或作为运行时 primitive 的渲染元素。

### TooltipIconButton {#tooltipiconbutton}

接受按钮子节点及提示文字。为只有图标的操作提供可读名称。
