---
title: Input（单行输入）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Input（单行输入）

用于表单和用户数据录入的文本输入组件，内置样式和无障碍功能。

<demo react="shadcn-base/input-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add input
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/input.tsx [components/ui/input.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Input } from "@/components/ui/input"
```

```tsx
<Input />
```

## 基础 {#basic}

<demo react="shadcn-base/input-basic.tsx" />

## 表单字段 {#field}

使用 `Field`、`FieldLabel` 和 `FieldDescription` 创建带
标签和描述的输入框。

<demo react="shadcn-base/input-field.tsx" />

## 字段组 {#field-group}

使用 `FieldGroup` 展示多个 `Field` 区块并构建表单。

<demo react="shadcn-base/input-fieldgroup.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁用输入框。要设置禁用状态的样式，可在 `Field` 组件上添加 `data-disabled` 属性。

<demo react="shadcn-base/input-disabled.tsx" />

## 无效状态 {#invalid}

使用 `aria-invalid` 属性标记输入无效。要设置无效状态的样式，可在 `Field` 组件上添加 `data-invalid` 属性。

<demo react="shadcn-base/input-invalid.tsx" />

## 文件 {#file}

使用 `type="file"` 属性创建文件输入框。

<demo react="shadcn-base/input-file.tsx" />

## 行内排列 {#inline}

在 `Field` 上使用 `orientation="horizontal"` 创建行内输入框。
搭配 `Button` 可创建带按钮的搜索输入框。

<demo react="shadcn-base/input-inline.tsx" />

## 网格 {#grid}

使用网格布局并排放置多个输入框。

<demo react="shadcn-base/input-grid.tsx" />

## 必填 {#required}

使用 `required` 属性标记必填输入框。

<demo react="shadcn-base/input-required.tsx" />

## 徽标 {#badge}

在标签中使用 `Badge` 突出显示推荐字段。

<demo react="shadcn-base/input-badge.tsx" />

## 输入组 {#input-group}

使用 `InputGroup` 组件在输入框内添加图标、文本或按钮。更多示例请参阅[输入组](https://ui.shadcn.com/docs/components/input-group)组件。

<demo react="shadcn-base/input-input-group.tsx" />

## 按钮组 {#button-group}

使用 `ButtonGroup` 组件为输入框添加按钮。更多示例请参阅[按钮组](https://ui.shadcn.com/docs/components/button-group)组件。

<demo react="shadcn-base/input-button-group.tsx" />

## 表单 {#form}

一个完整的表单示例，包含多个输入框、一个选择器和一个按钮。

<demo react="shadcn-base/input-form.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/input-rtl.tsx" />
