---
title: Input Group（输入框组合）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Input Group（输入框组合）

为输入框添加附加项、按钮和帮助内容。

<demo react="shadcn-base/input-group-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add input-group
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/input-group.tsx [components/ui/input-group.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
```

```tsx:line-numbers
<InputGroup>
  <InputGroupInput placeholder="Search..." />
  <InputGroupAddon>
    <SearchIcon />
  </InputGroupAddon>
</InputGroup>
```

## 组件结构 {#composition}

使用以下结构构建 `InputGroup`：

```text
InputGroup
├── InputGroupInput or InputGroupTextarea
├── InputGroupAddon
├── InputGroupButton
└── InputGroupText
```

## 对齐 {#align}

使用 `InputGroupAddon` 的 `align` 属性设置附加项相对于输入框的位置。

<div class="shadcn-doc-callout">

  为保证焦点管理正确，`InputGroupAddon` 在 DOM 中应始终置于
  `InputGroupInput` 或 `InputGroupTextarea` 之后。使用 `align` 属性
  设置附加项在界面上的位置。

</div>

### inline-start {#inline-start}

使用 `align="inline-start"` 将附加项放在输入框的行内起始侧。这是默认值。

<demo react="shadcn-base/input-group-inline-start.tsx" />

### inline-end {#inline-end}

使用 `align="inline-end"` 将附加项放在输入框的行内末尾侧。

<demo react="shadcn-base/input-group-inline-end.tsx" />

### block-start {#block-start}

使用 `align="block-start"` 将附加项放在输入框上方。

<demo react="shadcn-base/input-group-block-start.tsx" />

### block-end {#block-end}

使用 `align="block-end"` 将附加项放在输入框下方。

<demo react="shadcn-base/input-group-block-end.tsx" />

## 图标 {#icon}

<demo react="shadcn-base/input-group-icon.tsx" />

## 文本 {#text}

<demo react="shadcn-base/input-group-text.tsx" />

## 按钮 {#button}

<demo react="shadcn-base/input-group-button.tsx" />

## 键盘按键 {#kbd}

<demo react="shadcn-base/input-group-kbd.tsx" />

## 下拉菜单 {#dropdown}

<demo react="shadcn-base/input-group-dropdown.tsx" />

## 加载指示器 {#spinner}

<demo react="shadcn-base/input-group-spinner.tsx" />

## 多行输入框 {#textarea}

<demo react="shadcn-base/input-group-textarea.tsx" />

## 自定义输入框 {#custom-input}

在自定义输入框上添加 `data-slot="input-group-control"` 属性，可自动处理焦点状态。

以下示例使用第三方库提供的可调整尺寸的多行输入框。

<demo react="shadcn-base/input-group-custom.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/input-group-rtl.tsx" />

## API 参考 {#api-reference}

### InputGroup {#inputgroup}

包裹输入框及附加项的主组件。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<InputGroup>
  <InputGroupInput />
  <InputGroupAddon />
</InputGroup>
```

### InputGroupAddon {#inputgroupaddon}

在输入框旁显示图标、文本、按钮或其他内容。

<div class="shadcn-doc-callout">

**焦点导航**

  为保证焦点导航正确，`InputGroupAddon` 组件应置于
  输入框之后。用 `align` 属性设置附加项的位置。

</div>

| 属性        | 类型                                                             | 默认值          |
| ----------- | ---------------------------------------------------------------- | ---------------- |
| `align`     | `"inline-start" \| "inline-end" \| "block-start" \| "block-end"` | `"inline-start"` |
| `className` | `string`                                                         |                  |

```tsx
<InputGroupAddon align="inline-end">
  <SearchIcon />
</InputGroupAddon>
```

**对于 `<InputGroupInput />`，使用 `inline-start` 或 `inline-end` 对齐。对于 `<InputGroupTextarea />`，使用 `block-start` 或 `block-end` 对齐。**

`InputGroupAddon` 组件可包含多个 `InputGroupButton` 组件及图标。

```tsx
<InputGroupAddon>
  <InputGroupButton>Button</InputGroupButton>
  <InputGroupButton>Button</InputGroupButton>
</InputGroupAddon>
```

### InputGroupButton {#inputgroupbutton}

在输入组中显示按钮。

| 属性        | 类型                                                                          | 默认值   |
| ----------- | ----------------------------------------------------------------------------- | --------- |
| `size`      | `"xs" \| "icon-xs" \| "sm" \| "icon-sm"`                                      | `"xs"`    |
| `variant`   | `"default" \| "destructive" \| "outline" \| "secondary" \| "ghost" \| "link"` | `"ghost"` |
| `className` | `string`                                                                      |           |

```tsx
<InputGroupButton>Button</InputGroupButton>
<InputGroupButton size="icon-xs" aria-label="Copy">
  <CopyIcon />
</InputGroupButton>
```

### InputGroupInput {#inputgroupinput}

构建输入组时替代 `<Input />`。此组件预置了输入组样式，并通过统一的 `data-slot="input-group-control"` 处理焦点状态。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

所有其他属性都传递给底层的 `<Input />` 组件。

```tsx
<InputGroup>
  <InputGroupInput placeholder="Enter text..." />
  <InputGroupAddon>
    <SearchIcon />
  </InputGroupAddon>
</InputGroup>
```

### InputGroupTextarea {#inputgrouptextarea}

构建输入组时替代 `<Textarea />`。此组件预置了多行输入组样式，并通过统一的 `data-slot="input-group-control"` 处理焦点状态。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

所有其他属性都传递给底层的 `<Textarea />` 组件。

```tsx
<InputGroup>
  <InputGroupTextarea placeholder="Enter message..." />
  <InputGroupAddon align="block-end">
    <InputGroupButton>Send</InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```
