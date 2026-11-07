---
title: Select（单选列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Select（单选列表）

通过按钮打开选项列表，供用户选择。

<demo react="shadcn-base/select-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add select
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/select.tsx [components/ui/select.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
```

```tsx:line-numbers
const items = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
]

<Select items={items}>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Theme" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {items.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

## 组件结构 {#composition}

使用以下结构构建 `Select`：

```text
Select
├── SelectTrigger
│   └── SelectValue
└── SelectContent
    ├── SelectGroup
    │   ├── SelectLabel
    │   ├── SelectItem
    │   └── SelectItem
    ├── SelectSeparator
    └── SelectGroup
        ├── SelectLabel
        ├── SelectItem
        └── SelectItem
```

## 选中项与触发器对齐 {#align-item-with-trigger}

在 `SelectContent` 上使用 `alignItemWithTrigger`，控制选中项是否与触发器对齐。设为 `true`（默认值）时，弹出层会定位到使选中项盖在触发器上的位置。设为 `false` 时，弹出层与触发器的边缘对齐。

<demo react="shadcn-base/select-align-item.tsx" />

## 分组 {#groups}

使用 `SelectGroup`、`SelectLabel` 和 `SelectSeparator` 组织选项。

<demo react="shadcn-base/select-groups.tsx" />

## 可滚动 {#scrollable}

包含多个选项的可滚动选择器。

<demo react="shadcn-base/select-scrollable.tsx" />

## 禁用 {#disabled}

<demo react="shadcn-base/select-disabled.tsx" />

## 无效 {#invalid}

在 `Field` 组件上添加 `data-invalid` 属性，并在 `SelectTrigger` 组件上添加 `aria-invalid` 属性，即可显示错误状态。

```tsx:line-numbers
<Field data-invalid>
  <FieldLabel>Fruit</FieldLabel>
  <SelectTrigger aria-invalid>
    <SelectValue />
  </SelectTrigger>
</Field>
```

<demo react="shadcn-base/select-invalid.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/select-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Select](https://base-ui.com/react/components/select#api-reference) 文档。
