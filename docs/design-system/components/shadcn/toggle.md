---
title: Toggle（切换按钮）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Toggle（切换按钮）

可在开启和关闭之间切换的双态按钮。

<demo react="shadcn-base/toggle-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add toggle
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/toggle.tsx [components/ui/toggle.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Toggle } from "@/components/ui/toggle"
```

```tsx
<Toggle>Toggle</Toggle>
```

## 描边 {#outline}

使用 `variant="outline"` 应用描边样式。

<demo react="shadcn-base/toggle-outline.tsx" />

## 带文本 {#with-text}

<demo react="shadcn-base/toggle-text.tsx" />

## 尺寸 {#size}

使用 `size` 属性调整切换按钮的尺寸。

<demo react="shadcn-base/toggle-sizes.tsx" />

## 禁用 {#disabled}

<demo react="shadcn-base/toggle-disabled.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/toggle-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Toggle](https://base-ui.com/react/components/toggle#api-reference) 文档。
