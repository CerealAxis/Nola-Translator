---
title: Checkbox（复选框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Checkbox（复选框）

允许用户在选中和未选中之间切换的控件。

<demo react="shadcn-base/checkbox-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add checkbox
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/checkbox.tsx [components/ui/checkbox.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Checkbox } from "@/components/ui/checkbox"
```

```tsx
<Checkbox />
```

## 选中状态 {#checked-state}

对于非受控复选框，请使用 `defaultChecked`，也可以使用 `checked` 和
`onCheckedChange` 控制状态。

```tsx:line-numbers
import * as React from "react"

export function Example() {
  const [checked, setChecked] = React.useState(false)

  return <Checkbox checked={checked} onCheckedChange={setChecked} />
}
```

## 无效状态 {#invalid-state}

在复选框上设置 `aria-invalid`，并在字段包裹元素上设置 `data-invalid`，
即可显示无效样式。

<demo react="shadcn-base/checkbox-invalid.tsx" />

## 基础 {#basic}

将复选框与 `Field` 和 `FieldLabel` 搭配，确保布局和标签正确。

<demo react="shadcn-base/checkbox-basic.tsx" />

## 说明 {#description}

使用 `FieldContent` 和 `FieldDescription` 显示辅助文字。

<demo react="shadcn-base/checkbox-description.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁止交互，并为 `<Field>` 组件添加 `data-disabled` 属性以显示禁用样式。

<demo react="shadcn-base/checkbox-disabled.tsx" />

## 分组 {#group}

使用多个字段创建复选框列表。

<demo react="shadcn-base/checkbox-group.tsx" />

## 表格 {#table}

<demo react="shadcn-base/checkbox-table.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/checkbox-rtl.tsx" />

## API 参考 {#api-reference}

更多信息请参阅 [Base UI](https://base-ui.com/react/components/checkbox#api-reference) 文档。
