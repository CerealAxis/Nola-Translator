---
title: Skeleton（骨架屏）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Skeleton（骨架屏）

在内容加载期间显示占位元素。

<demo react="shadcn-base/skeleton-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add skeleton
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/skeleton.tsx [components/ui/skeleton.tsx]

**2. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Skeleton } from "@/components/ui/skeleton"
```

```tsx
<Skeleton className="h-[20px] w-[100px] rounded-full" />
```

## 头像 {#avatar}

<demo react="shadcn-base/skeleton-avatar.tsx" />

## 卡片 {#card}

<demo react="shadcn-base/skeleton-card.tsx" />

## 文本 {#text}

<demo react="shadcn-base/skeleton-text.tsx" />

## 表单 {#form}

<demo react="shadcn-base/skeleton-form.tsx" />

## 表格 {#table}

<demo react="shadcn-base/skeleton-table.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/skeleton-rtl.tsx" />
