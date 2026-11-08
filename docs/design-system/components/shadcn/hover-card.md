---
title: Hover Card（悬停卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Hover Card（悬停卡片）

供明眼用户预览链接指向的内容。

<demo react="shadcn-base/hover-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add hover-card
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/hover-card.tsx [components/ui/hover-card.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
```

```tsx:line-numbers
<HoverCard>
  <HoverCardTrigger>Hover</HoverCardTrigger>
  <HoverCardContent>
    The React Framework – created and maintained by @vercel.
  </HoverCardContent>
</HoverCard>
```

## 组件结构 {#composition}

使用以下结构构建 `HoverCard`：

```text
HoverCard
├── HoverCardTrigger
└── HoverCardContent
```

## 触发延时 {#trigger-delays}

在触发器上使用 `delay` 和 `closeDelay` 控制卡片打开和
关闭的时机。

```tsx:line-numbers
<HoverCard>
  <HoverCardTrigger delay={100} closeDelay={200}>
    Hover
  </HoverCardTrigger>
  <HoverCardContent>Content</HoverCardContent>
</HoverCard>
```

## 定位 {#positioning}

使用 `HoverCardContent` 的 `side` 和 `align` 属性控制位置。

```tsx:line-numbers
<HoverCard>
  <HoverCardTrigger>Hover</HoverCardTrigger>
  <HoverCardContent side="top" align="start">
    Content
  </HoverCardContent>
</HoverCard>
```

## 基础 {#basic}

<demo react="shadcn-base/hover-card-demo.tsx" />

## 放置方向 {#sides}

<demo react="shadcn-base/hover-card-sides.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/hover-card-rtl.tsx" />

## API 参考 {#api-reference}

详情请参阅 [Base UI](https://base-ui.com/react/components/hover-card#api-reference) 文档。
