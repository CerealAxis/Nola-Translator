---
title: Button Group（按钮组合）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Button Group（按钮组合）

将相关按钮组合在一起，并提供一致样式的容器。

<demo react="shadcn-base/button-group-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add button-group
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/button-group.tsx [components/ui/button-group.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group"
```

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

## 结构 {#composition}

按以下结构组合 `ButtonGroup`：

```text
ButtonGroup
├── Button or Input
├── ButtonGroupSeparator
└── ButtonGroupText
```

## 无障碍 {#accessibility}

- `ButtonGroup` 组件的 `role` 属性设为 `group`。
- 使用 <Kbd>Tab</Kbd> 在组内按钮之间切换。
- 使用 `aria-label` 或 `aria-labelledby` 为按钮组设置标签。

```tsx:line-numbers
<ButtonGroup aria-label="Button group">
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

## ButtonGroup 和 ToggleGroup 的区别 {#buttongroup-vs-togglegroup}

- 将执行操作的按钮分组时，使用 `ButtonGroup` 组件。
- 将切换状态的按钮分组时，使用 `ToggleGroup` 组件。

## 排列方向 {#orientation}

设置 `orientation` 属性可以改变按钮组的布局。

<demo react="shadcn-base/button-group-orientation.tsx" />

## 尺寸 {#size}

通过单个按钮的 `size` 属性控制其尺寸。

<demo react="shadcn-base/button-group-size.tsx" />

## 嵌套 {#nested}

嵌套 `<ButtonGroup>` 组件可创建带间距的按钮组。

<demo react="shadcn-base/button-group-nested.tsx" />

## 分隔符 {#separator}

`ButtonGroupSeparator` 组件在视觉上分隔组内的按钮。

`outline` 变体的按钮自带边框，无需分隔符。其他变体推荐使用分隔符来改善视觉层级。

<demo react="shadcn-base/button-group-separator.tsx" />

## 拆分按钮 {#split}

使用 `ButtonGroupSeparator` 分隔两个按钮，即可创建拆分按钮组。

<demo react="shadcn-base/button-group-split.tsx" />

## 输入框 {#input}

将 `Input` 组件放在按钮之间。

<demo react="shadcn-base/button-group-input.tsx" />

## 输入框组 {#input-group}

将 `InputGroup` 组件放入按钮组，可以创建复杂的输入布局。

<demo react="shadcn-base/button-group-input-group.tsx" />

## 下拉菜单 {#dropdown-menu}

使用 `DropdownMenu` 组件创建拆分按钮组。

<demo react="shadcn-base/button-group-dropdown.tsx" />

## 选择器 {#select}

与 `Select` 组件搭配使用。

<demo react="shadcn-base/button-group-select.tsx" />

## 弹出框 {#popover}

与 `Popover` 组件搭配使用。

<demo react="shadcn-base/button-group-popover.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/button-group-rtl.tsx" />

## API 参考 {#api-reference}

### ButtonGroup {#buttongroup}

`ButtonGroup` 组件将相关按钮组合在一起，并提供一致的样式。

| 属性          | 类型                         | 默认值        |
| ------------- | ---------------------------- | -------------- |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` |

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

嵌套多个按钮组可创建带间距的复杂布局。更多信息请参阅[嵌套](#nested)示例。

```tsx
<ButtonGroup>
  <ButtonGroup />
  <ButtonGroup />
</ButtonGroup>
```

### ButtonGroupSeparator {#buttongroupseparator}

`ButtonGroupSeparator` 组件在视觉上分隔组内的按钮。

| 属性          | 类型                         | 默认值      |
| ------------- | ---------------------------- | ------------ |
| `orientation` | `"horizontal" \| "vertical"` | `"vertical"` |

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <ButtonGroupSeparator />
  <Button>Button 2</Button>
</ButtonGroup>
```

### ButtonGroupText {#buttongrouptext}

用此组件在按钮组中显示文字。

| 属性     | 类型                 | 默认值 |
| -------- | -------------------- | ------- |
| `render` | `React.ReactElement` |         |

```tsx
<ButtonGroup>
  <ButtonGroupText>Text</ButtonGroupText>
  <Button>Button</Button>
</ButtonGroup>
```

使用 `render` 属性可以将文字渲染为自定义组件，例如标签。

```tsx:line-numbers
import { ButtonGroupText } from "@/components/ui/button-group"
import { Label } from "@/components/ui/label"

export function ButtonGroupTextDemo() {
  return (
    <ButtonGroup>
      <ButtonGroupText render={<Label htmlFor="name" />}>Text</ButtonGroupText>
      <Input placeholder="Type something here..." id="name" />
    </ButtonGroup>
  )
}
```
