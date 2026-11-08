---
title: Badge（徽标）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Badge（徽标）

显示徽章或外观类似徽章的组件。

<demo react="shadcn-base/badge-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add badge
```

</template>

<template #manual>

**1. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/badge.tsx [components/ui/badge.tsx]

**2. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Badge } from "@/components/ui/badge"
```

```tsx
<Badge variant="default | outline | secondary | destructive">Badge</Badge>
```

## 变体 {#variants}

使用 `variant` 属性切换徽章变体。

<demo react="shadcn-base/badge-variants.tsx" />

## 带图标 {#with-icon}

可以在徽章内渲染图标。使用 `data-icon="inline-start"` 将图标放在左侧，使用 `data-icon="inline-end"` 将图标放在右侧。

<demo react="shadcn-base/badge-icon.tsx" />

## 带加载指示器 {#with-spinner}

可以在徽章内渲染加载指示器。请为指示器添加 `data-icon="inline-start"` 或 `data-icon="inline-end"` 属性。

<demo react="shadcn-base/badge-spinner.tsx" />

## 链接 {#link}

使用 `render` 属性将徽章渲染为链接。

<demo react="shadcn-base/badge-link.tsx" />

## 自定义颜色 {#custom-colors}

可以向 `Badge` 组件添加 `bg-chart-2/10 text-foreground` 等自定义类来调整徽章颜色。

<demo react="shadcn-base/badge-colors.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/badge-rtl.tsx" />

## API 参考 {#api-reference}

### Badge {#badge}

`Badge` 组件显示徽章或外观类似徽章的组件。

| 属性        | 类型                                                                          | 默认值     |
| ----------- | ----------------------------------------------------------------------------- | ----------- |
| `variant`   | `"default" \| "secondary" \| "destructive" \| "outline" \| "ghost" \| "link"` | `"default"` |
| `className` | `string`                                                                      | -           |
