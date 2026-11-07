---
title: Native Select（原生选择框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Native Select（原生选择框）

应用样式并与设计系统保持一致的原生 HTML 选择元素。

<div class="shadcn-doc-callout">

  如需使用自定义样式的选择器，请参阅 [Select](https://ui.shadcn.com/docs/components/select)
  组件。

</div>

<demo react="shadcn-base/native-select-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add native-select
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/native-select.tsx [components/ui/native-select.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
```

```tsx:line-numbers
<NativeSelect>
  <NativeSelectOption value="">Select a fruit</NativeSelectOption>
  <NativeSelectOption value="apple">Apple</NativeSelectOption>
  <NativeSelectOption value="banana">Banana</NativeSelectOption>
  <NativeSelectOption value="blueberry">Blueberry</NativeSelectOption>
  <NativeSelectOption value="pineapple">Pineapple</NativeSelectOption>
</NativeSelect>
```

## 组件结构 {#composition}

### 简单 {#simple}

直接将选项放在 `NativeSelect` 下（无需使用 `NativeSelectOptGroup`）。

```text
NativeSelect
├── NativeSelectOption
├── NativeSelectOption
├── NativeSelectOption
└── NativeSelectOption
```

### 带分组 {#with-groups}

使用 `NativeSelectOptGroup` 按类别组织选项。

```text
NativeSelect
├── NativeSelectOptGroup
│   ├── NativeSelectOption
│   └── NativeSelectOption
└── NativeSelectOptGroup
    ├── NativeSelectOption
    └── NativeSelectOption
```

## 分组 {#groups}

使用 `NativeSelectOptGroup` 按类别组织选项。

<demo react="shadcn-base/native-select-groups.tsx" />

## 禁用 {#disabled}

在 `NativeSelect` 组件上添加 `disabled` 属性可禁用选择器。

<demo react="shadcn-base/native-select-disabled.tsx" />

## 无效状态 {#invalid}

使用 `aria-invalid` 显示校验错误，并在 `Field` 组件上添加 `data-invalid` 属性来设置样式。

<demo react="shadcn-base/native-select-invalid.tsx" />

## Native Select 与 Select 的区别 {#native-select-vs-select}

- 需要浏览器原生交互、更好的性能或针对移动设备优化的下拉列表时，使用 `NativeSelect`。
- 需要自定义样式、动画或复杂交互时，使用 `Select`。

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/native-select-rtl.tsx" />

## API 参考 {#api-reference}

### NativeSelect {#nativeselect}

包裹原生 HTML 选择元素的主组件。

```tsx
<NativeSelect>
  <NativeSelectOption value="option1">Option 1</NativeSelectOption>
  <NativeSelectOption value="option2">Option 2</NativeSelectOption>
</NativeSelect>
```

### NativeSelectOption {#nativeselectoption}

表示选择器中的单个选项。

| 属性       | 类型      | 默认值 |
| ---------- | --------- | ------- |
| `value`    | `string`  |         |
| `disabled` | `boolean` | `false` |

### NativeSelectOptGroup {#nativeselectoptgroup}

将相关选项归为一组，便于组织。

| 属性       | 类型      | 默认值 |
| ---------- | --------- | ------- |
| `label`    | `string`  |         |
| `disabled` | `boolean` | `false` |

```tsx
<NativeSelectOptGroup label="Fruits">
  <NativeSelectOption value="apple">Apple</NativeSelectOption>
  <NativeSelectOption value="banana">Banana</NativeSelectOption>
</NativeSelectOptGroup>
```
