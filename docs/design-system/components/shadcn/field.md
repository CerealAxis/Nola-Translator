---
title: Field（表单字段）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Field（表单字段）

将标签、控件和帮助文本组合为无障碍表单字段和输入组。

<demo react="shadcn-base/field-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add field
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/field.tsx [components/ui/field.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
```

```tsx:line-numbers
<FieldSet>
  <FieldLegend>Profile</FieldLegend>
  <FieldDescription>This appears on invoices and emails.</FieldDescription>
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="name">Full name</FieldLabel>
      <Input id="name" autoComplete="off" placeholder="Evil Rabbit" />
      <FieldDescription>This appears on invoices and emails.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor="username">Username</FieldLabel>
      <Input id="username" autoComplete="off" aria-invalid />
      <FieldError>Choose another username.</FieldError>
    </Field>
    <Field orientation="horizontal">
      <Switch id="newsletter" />
      <FieldLabel htmlFor="newsletter">Subscribe to the newsletter</FieldLabel>
    </Field>
  </FieldGroup>
</FieldSet>
```

## 组件结构 {#composition}

### Field {#field}

带标签、帮助文本和校验的单个控件。

```text
Field
├── FieldLabel
├── Input / Textarea / Switch / Select
├── FieldDescription
└── FieldError
```

### FieldGroup {#fieldgroup}

将相关字段放入同一组。需要时，在不同区块间使用 `FieldSeparator`。

```text
FieldGroup
├── Field
│   ├── FieldLabel
│   ├── Input / Textarea / Switch / Select
│   ├── FieldDescription
│   └── FieldError
├── FieldSeparator
└── Field
    ├── FieldLabel
    └── Input / Textarea / Switch / Select
```

### FieldSet {#fieldset}

包含图例和描述的语义分组，通常包含一个 `FieldGroup`。

```text
FieldSet
├── FieldLegend
├── FieldDescription
└── FieldGroup
    ├── Field
    │   ├── FieldLabel
    │   ├── Input / Textarea / Switch / Select
    │   ├── FieldDescription
    │   └── FieldError
    └── Field
        ├── FieldLabel
        └── Input / Textarea / Switch / Select
```

## 结构解析 {#anatomy}

`Field` 系列用于构建无障碍表单。典型字段的结构如下：

```tsx:line-numbers
<Field>
  <FieldLabel htmlFor="input-id">Label</FieldLabel>
  {/* Input, Select, Switch, etc. */}
  <FieldDescription>Optional helper text.</FieldDescription>
  <FieldError>Validation message.</FieldError>
</Field>
```

- `Field` 是单个字段的核心容器。
- `FieldContent` 是一个纵向 Flex 容器，用来组织标签和描述。没有描述时可省略。
- 用 `FieldGroup` 包裹相关字段，用 `FieldSet` 搭配 `FieldLegend` 进行语义分组。

## 表单 {#form}

参阅[表单](https://ui.shadcn.com/docs/forms)文档，了解如何结合 `Field` 组件与 [React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form)、[Tanstack Form](https://ui.shadcn.com/docs/forms/tanstack-form) 或 [Formisch](https://ui.shadcn.com/docs/forms/formisch) 构建表单。

## 输入框 {#input}

<demo react="shadcn-base/field-input.tsx" />

## 多行输入框 {#textarea}

<demo react="shadcn-base/field-textarea.tsx" />

## 选择器 {#select}

<demo react="shadcn-base/field-select.tsx" />

## 滑块 {#slider}

<demo react="shadcn-base/field-slider.tsx" />

## 字段集 {#fieldset-1}

<demo react="shadcn-base/field-fieldset.tsx" />

## 复选框 {#checkbox}

<demo react="shadcn-base/field-checkbox.tsx" />

## 单选框 {#radio}

<demo react="shadcn-base/field-radio.tsx" />

## 开关 {#switch}

<demo react="shadcn-base/field-switch.tsx" />

## 选择卡片 {#choice-card}

在 `FieldLabel` 中包裹 `Field` 组件可创建可选字段组。适用于 `RadioItem`、`Checkbox` 和 `Switch` 组件。

<demo react="shadcn-base/field-choice-card.tsx" />

## 字段组 {#field-group}

用 `FieldGroup` 堆叠 `Field` 组件，并添加 `FieldSeparator` 进行分隔。

<demo react="shadcn-base/field-group.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/field-rtl.tsx" />

## 响应式布局 {#responsive-layout}

- **纵向字段：** 默认方向将标签、控件和帮助文本纵向排列，适合移动优先的布局。
- **横向字段：** 在 `Field` 上设置 `orientation="horizontal"`，让标签和控件并排排列。配合 `FieldContent` 可对齐描述。
- **响应式字段：** 设置 `orientation="responsive"`，在支持容器查询的父元素内自动切换列布局。在 `FieldGroup` 上应用 `@container/field-group` 类，在指定断点切换方向。

<demo react="shadcn-base/field-responsive.tsx" />

## 校验与错误 {#validation-and-errors}

- 在 `Field` 上添加 `data-invalid`，让整个字段区块进入错误状态。
- 在输入控件本身添加 `aria-invalid`，供辅助技术识别。
- 将 `FieldError` 紧接着控件渲染，或放在 `FieldContent` 内，使错误信息与字段对齐。

```tsx:line-numbers
<Field data-invalid>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" type="email" aria-invalid />
  <FieldError>Enter a valid email address.</FieldError>
</Field>
```

## 无障碍 {#accessibility}

- `FieldSet` 和 `FieldLegend` 将相关控件分组，方便键盘和辅助技术用户使用。
- `Field` 输出 `role="group"`，与 `FieldLabel` 和 `FieldLegend` 搭配使用时，嵌套控件可继承标签信息。
- 适量使用 `FieldSeparator`，以便屏幕阅读器清楚区分各区块。

## API 参考 {#api-reference}

### FieldSet {#fieldset-2}

渲染语义化 `fieldset` 并应用预设间距的容器。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldSet>
  <FieldLegend>Delivery</FieldLegend>
  <FieldGroup>{/* Fields */}</FieldGroup>
</FieldSet>
```

### FieldLegend {#fieldlegend}

`FieldSet` 的图例元素。切换到 `label` 变体可与标签尺寸保持一致。

| 属性        | 类型                  | 默认值    |
| ----------- | --------------------- | ---------- |
| `variant`   | `"legend" \| "label"` | `"legend"` |
| `className` | `string`              |            |

```tsx
<FieldLegend variant="label">Notification Preferences</FieldLegend>
```

`FieldLegend` 有两种变体：`legend` 和 `label`。`label` 变体采用标签的尺寸和对齐方式，适合嵌套的 `FieldSet`。

### FieldGroup {#fieldgroup-1}

用于堆叠 `Field` 组件的布局容器，并启用容器查询以实现响应式排列。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldGroup className="@container/field-group flex flex-col gap-6">
  <Field>{/* ... */}</Field>
  <Field>{/* ... */}</Field>
</FieldGroup>
```

### Field {#field-1}

单个字段的核心容器，提供方向控制、无效状态样式和间距。

| 属性           | 类型                                         | 默认值      |
| -------------- | -------------------------------------------- | ------------ |
| `orientation`  | `"vertical" \| "horizontal" \| "responsive"` | `"vertical"` |
| `className`    | `string`                                     |              |
| `data-invalid` | `boolean`                                    |              |

```tsx
<Field orientation="horizontal">
  <FieldLabel htmlFor="remember">Remember me</FieldLabel>
  <Switch id="remember" />
</Field>
```

### FieldContent {#fieldcontent}

标签位于控件旁边时，用纵向 Flex 容器将控件与描述分组。没有描述时可省略。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<Field>
  <Checkbox id="notifications" />
  <FieldContent>
    <FieldLabel htmlFor="notifications">Notifications</FieldLabel>
    <FieldDescription>Email, SMS, and push options.</FieldDescription>
  </FieldContent>
</Field>
```

### FieldLabel {#fieldlabel}

适用于直接输入控件和嵌套 `Field` 子项的标签样式。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldLabel htmlFor="email">Email</FieldLabel>
```

### FieldTitle {#fieldtitle}

在 `FieldContent` 中渲染带标签样式的标题。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldContent>
  <FieldTitle>Enable Touch ID</FieldTitle>
  <FieldDescription>Unlock your device faster.</FieldDescription>
</FieldContent>
```

### FieldDescription {#fielddescription}

帮助文本插槽，在横向布局中自动平衡较长文本的换行。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldDescription>We never share your email with anyone.</FieldDescription>
```

### FieldSeparator {#fieldseparator}

用于分隔 `FieldGroup` 内部区块的视觉分隔线，可接收可选的行内内容。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<FieldSeparator>Or continue with</FieldSeparator>
```

### FieldError {#fielderror}

无障碍错误容器，可接收子元素或 `errors` 数组（例如来自 `react-hook-form` 的错误）。

| 属性        | 类型                                       | 默认值 |
| ----------- | ------------------------------------------ | ------- |
| `errors`    | `Array<{ message?: string } \| undefined>` |         |
| `className` | `string`                                   |         |

```tsx
<FieldError errors={errors.username} />
```

`errors` 数组中有多条消息时，组件会自动渲染为列表。

`FieldError` 也支持任何实现 [Standard Schema](https://standardschema.dev/) 的校验器所产生的问题信息，包括 Zod、Valibot 和 ArkType。直接传入 schema 校验结果中的 `issues` 数组，即可统一渲染来自不同库的错误列表。
