---
title: Combobox（可搜索选择）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Combobox（可搜索选择）

带建议列表的自动补全输入框。

<demo react="shadcn-base/combobox-demo.tsx" />

*A combobox with a list of frameworks.*

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add combobox
```

</template>
<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/combobox.tsx [components/ui/combobox.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
```

```tsx:line-numbers
const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]

export function ExampleCombobox() {
  return (
    <Combobox items={frameworks}>
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
```

## 结构 {#composition}

### 简单结构 {#simple}

单行输入框和平铺列表（参见[基础](#basic)）。

```text
Combobox
├── ComboboxInput
└── ComboboxContent
    ├── ComboboxEmpty
    └── ComboboxList
        ├── ComboboxItem
        └── ComboboxItem
```

### 带标签 {#with-chips}

通过 `multiple`、标签和标签输入框实现多选（参见[多选](#multiple)）。

```text
Combobox
├── ComboboxChips
│   ├── ComboboxValue
│   │   └── ComboboxChip
│   └── ComboboxChipsInput
└── ComboboxContent
    ├── ComboboxEmpty
    └── ComboboxList
        ├── ComboboxItem
        └── ComboboxItem
```

### 带分组和集合 {#with-groups-and-collection}

在每个 `ComboboxGroup` 内使用 `ComboboxCollection` 嵌套条目，并用分隔符隔开各组（参见[分组](#groups)）。

```text
Combobox
├── ComboboxInput
└── ComboboxContent
    ├── ComboboxEmpty
    └── ComboboxList
        ├── ComboboxGroup
        │   ├── ComboboxLabel
        │   └── ComboboxCollection
        │       ├── ComboboxItem
        │       └── ComboboxItem
        ├── ComboboxSeparator
        └── ComboboxGroup
            ├── ComboboxLabel
            └── ComboboxCollection
                ├── ComboboxItem
                └── ComboboxItem
```

## 自定义条目 {#custom-items}

条目为对象时，请使用 `itemToStringValue`。

```tsx:line-numbers
import * as React from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

type Framework = {
  label: string
  value: string
}

const frameworks: Framework[] = [
  { label: "Next.js", value: "next" },
  { label: "SvelteKit", value: "sveltekit" },
  { label: "Nuxt", value: "nuxt" },
]

export function ExampleComboboxCustomItems() {
  return (
    <Combobox
      items={frameworks}
      itemToStringValue={(framework) => framework.label}
    >
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(framework) => (
            <ComboboxItem key={framework.value} value={framework}>
              {framework.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
```

## 多项选择 {#multiple-selection}

将 `multiple` 与标签搭配使用，启用多选。

```tsx:line-numbers
import * as React from "react"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox"

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]

export function ExampleComboboxMultiple() {
  const [value, setValue] = React.useState<string[]>([])

  return (
    <Combobox
      items={frameworks}
      multiple
      value={value}
      onValueChange={setValue}
    >
      <ComboboxChips>
        <ComboboxValue>
          {value.map((item) => (
            <ComboboxChip key={item}>{item}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput placeholder="Add framework" />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
```

## 基础 {#basic}

带框架列表的简单组合框。

<demo react="shadcn-base/combobox-basic.tsx" />

## 多选 {#multiple}

使用 `multiple` 和 `ComboboxChips` 实现多选的组合框。

<demo react="shadcn-base/combobox-multiple.tsx" />

## 清除按钮 {#clear-button}

使用 `showClear` 属性显示清除按钮。

<demo react="shadcn-base/combobox-clear.tsx" />

## 分组 {#groups}

使用 `ComboboxGroup` 和 `ComboboxSeparator` 对条目分组。

<demo react="shadcn-base/combobox-groups.tsx" />

## 自定义条目 {#custom-items-1}

可以在 `ComboboxItem` 内渲染自定义组件。

<demo react="shadcn-base/combobox-custom.tsx" />

## 无效状态 {#invalid}

使用 `aria-invalid` 属性将组合框标记为无效。

<demo react="shadcn-base/combobox-invalid.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁用组合框。

<demo react="shadcn-base/combobox-disabled.tsx" />

## 自动高亮 {#auto-highlight}

使用 `autoHighlight` 属性，在筛选时自动高亮第一项。

<demo react="shadcn-base/combobox-auto-highlight.tsx" />

## 弹出层 {#popup}

可以通过 `render` 属性使用按钮或其他组件触发组合框。将 `ComboboxInput` 移入 `ComboboxContent`。

<demo react="shadcn-base/combobox-popup.tsx" />

## 输入框组 {#input-group}

在 `ComboboxInput` 内使用 `InputGroupAddon` 组件，可以为组合框添加附加内容。

<demo react="shadcn-base/combobox-input-group.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/combobox-rtl.tsx" />

## API 参考 {#api-reference}

更多信息请参阅 [Base UI](https://base-ui.com/react/components/combobox#api-reference) 文档。
