---
title: Tooltip（文字提示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Tooltip（文字提示）

当元素获得键盘焦点或鼠标悬停在其上时，弹出与该元素相关的信息。

<demo react="shadcn-base/tooltip-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**1. 运行以下命令：**

```bash
npx shadcn@latest add tooltip
```

**2. 将 `TooltipProvider` 添加到应用根节点。**

```tsx:line-numbers{1,7} [app/layout.tsx]
import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/tooltip.tsx [components/ui/tooltip.tsx]

**3. 更新导入路径，使其与项目配置一致。**

**4. 将 `TooltipProvider` 添加到应用根节点。**

```tsx:line-numbers{1,7} [app/layout.tsx]
import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
```

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
```

```tsx:line-numbers
<Tooltip>
  <TooltipTrigger>Hover</TooltipTrigger>
  <TooltipContent>
    <p>Add to library</p>
  </TooltipContent>
</Tooltip>
```

## 组件结构 {#composition}

使用以下结构构建 `Tooltip`：

```text
Tooltip
├── TooltipTrigger
└── TooltipContent
```

## 位置 {#side}

使用 `side` 属性调整工具提示的位置。

<demo react="shadcn-base/tooltip-sides.tsx" />

## 带快捷键 {#with-keyboard-shortcut}

<demo react="shadcn-base/tooltip-keyboard.tsx" />

## 禁用的按钮 {#disabled-button}

用 span 包裹禁用的按钮，即可为该按钮显示工具提示。

<demo react="shadcn-base/tooltip-disabled.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/tooltip-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Tooltip](https://base-ui.com/react/components/tooltip#api-reference) 文档。
