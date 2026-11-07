---
title: Spinner（加载指示器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Spinner（加载指示器）

用于显示加载状态的指示器。

<demo react="shadcn-base/spinner-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add spinner
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/spinner.tsx [components/ui/spinner.tsx]

**2. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Spinner } from "@/components/ui/spinner"
```

```tsx
<Spinner />
```

## 自定义 {#customization}

编辑 `Spinner` 组件，即可用其他图标替换默认的加载图标。

<demo react="shadcn-base/spinner-custom.tsx" />

```tsx:line-numbers [components/ui/spinner.tsx]
import { cn } from "cn"
import { LoaderIcon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
```

## 尺寸 {#size}

使用 `size-*` 工具类调整加载指示器的尺寸。

<demo react="shadcn-base/spinner-size.tsx" />

## 按钮 {#button}

在按钮中添加加载指示器来表示加载状态。要将 `<Spinner />` 放在开头，请将其置于标签前并设置 `data-icon="inline-start"`；要放在末尾，请将其置于标签后并设置 `data-icon="inline-end"`。

<demo react="shadcn-base/spinner-button.tsx" />

## 徽章 {#badge}

在徽章中添加加载指示器来表示加载状态。要将 `<Spinner />` 放在开头，请将其置于标签前并设置 `data-icon="inline-start"`；要放在末尾，请将其置于标签后并设置 `data-icon="inline-end"`。

<demo react="shadcn-base/spinner-badge.tsx" />

## 输入框组 {#input-group}

<demo react="shadcn-base/spinner-input-group.tsx" />

## 空状态 {#empty}

<demo react="shadcn-base/spinner-empty.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/spinner-rtl.tsx" />
