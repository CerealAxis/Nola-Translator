---
title: Scroll Area（滚动区域）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Scroll Area（滚动区域）

扩展原生滚动功能，支持跨浏览器的自定义样式。

<demo react="shadcn-base/scroll-area-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add scroll-area
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/scroll-area.tsx [components/ui/scroll-area.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
```

```tsx:line-numbers
<ScrollArea className="h-[200px] w-[350px] rounded-md border p-4">
  Your scrollable content here.
</ScrollArea>
```

## 组件结构 {#composition}

使用以下结构构建 `ScrollArea`：

```text
ScrollArea
└── ScrollBar
```

## 水平 {#horizontal}

在 `ScrollBar` 上设置 `orientation="horizontal"` 即可水平滚动。

<demo react="shadcn-base/scroll-area-horizontal-demo.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/scroll-area-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area#api-reference) 文档。
