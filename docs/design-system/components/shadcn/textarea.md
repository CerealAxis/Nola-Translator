---
title: Textarea（多行输入）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Textarea（多行输入）

显示表单中的多行文本框，或外观类似多行文本框的组件。

<demo react="shadcn-base/textarea-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add textarea
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/textarea.tsx [components/ui/textarea.tsx]

**2. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Textarea } from "@/components/ui/textarea"
```

```tsx
<Textarea />
```

## 字段 {#field}

使用 `Field`、`FieldLabel` 和 `FieldDescription` 创建带标签和描述的多行文本框。

<demo react="shadcn-base/textarea-field.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁用多行文本框。要为禁用状态设置样式，请在 `Field` 组件上添加 `data-disabled` 属性。

<demo react="shadcn-base/textarea-disabled.tsx" />

## 无效 {#invalid}

使用 `aria-invalid` 属性将多行文本框标记为无效。要为无效状态设置样式，请在 `Field` 组件上添加 `data-invalid` 属性。

<demo react="shadcn-base/textarea-invalid.tsx" />

## 按钮 {#button}

搭配 `Button` 创建带提交按钮的多行文本框。

<demo react="shadcn-base/textarea-button.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/textarea-rtl.tsx" />
