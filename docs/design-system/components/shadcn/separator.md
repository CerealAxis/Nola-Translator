---
title: Separator（分隔线）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Separator（分隔线）

在视觉或语义上分隔内容。

<demo react="shadcn-base/separator-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add separator
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/separator.tsx [components/ui/separator.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Separator } from "@/components/ui/separator"
```

```tsx:line-numbers
<Separator />
```

## 垂直 {#vertical}

使用 `orientation="vertical"` 创建垂直分隔线。

<demo react="shadcn-base/separator-vertical.tsx" />

## 菜单 {#menu}

在带描述的菜单项之间显示垂直分隔线。

<demo react="shadcn-base/separator-menu.tsx" />

## 列表 {#list}

在列表项之间显示水平分隔线。

<demo react="shadcn-base/separator-list.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/separator-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Separator](https://base-ui.com/react/components/separator#api-reference) 文档。
