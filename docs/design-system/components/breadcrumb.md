---
title: Breadcrumb（面包屑导航）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Breadcrumb（面包屑导航）

通过有层级的链接显示当前资源的路径。

<demo react="shadcn-base/breadcrumb-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add breadcrumb
```

</template>

<template #manual>

**1. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/breadcrumb.tsx [components/ui/breadcrumb.tsx]

**2. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
```

```tsx:line-numbers
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink render={<a href="/" />}>Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink render={<a href="/components" />}>
        Components
      </BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

## 结构 {#composition}

按以下结构组合 `Breadcrumb`：

```text
Breadcrumb
└── BreadcrumbList
    ├── BreadcrumbItem
    │   └── BreadcrumbLink
    ├── BreadcrumbSeparator
    ├── BreadcrumbItem
    │   └── BreadcrumbLink
    ├── BreadcrumbSeparator
    └── BreadcrumbItem
        └── BreadcrumbPage
```

## 基础 {#basic}

基础面包屑，包含首页链接和组件链接。

<demo react="shadcn-base/breadcrumb-basic.tsx" />

## 自定义分隔符 {#custom-separator}

将自定义组件作为 `<BreadcrumbSeparator />` 的 `children`，即可自定义分隔符。

<demo react="shadcn-base/breadcrumb-separator.tsx" />

## 下拉菜单 {#dropdown}

可以组合 `<BreadcrumbItem />` 和 `<DropdownMenu />`，在面包屑中创建下拉菜单。

<demo react="shadcn-base/breadcrumb-dropdown.tsx" />

## 折叠 {#collapsed}

面包屑过长时，可用 `<BreadcrumbEllipsis />` 组件显示折叠状态。

<demo react="shadcn-base/breadcrumb-ellipsis.tsx" />

## 链接组件 {#link-component}

使用 `<BreadcrumbLink />` 的 `render` 属性，可以渲染路由库提供的自定义链接组件。

<demo react="shadcn-base/breadcrumb-link.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/breadcrumb-rtl.tsx" />

## API 参考 {#api-reference}

### Breadcrumb {#breadcrumb}

`Breadcrumb` 是包裹所有面包屑组件的根导航元素。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### BreadcrumbList {#breadcrumblist}

`BreadcrumbList` 组件显示面包屑条目的有序列表。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### BreadcrumbItem {#breadcrumbitem}

`BreadcrumbItem` 组件包裹单个面包屑条目。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### BreadcrumbLink {#breadcrumblink}

`BreadcrumbLink` 组件显示面包屑中可点击的链接。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### BreadcrumbPage {#breadcrumbpage}

`BreadcrumbPage` 组件显示当前页面（不可点击）。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### BreadcrumbSeparator {#breadcrumbseparator}

`BreadcrumbSeparator` 组件在面包屑条目之间显示分隔符。可以传入自定义子元素替换默认的分隔符图标。

| 属性        | 类型              | 默认值 |
| ----------- | ----------------- | ------- |
| `children`  | `React.ReactNode` | -       |
| `className` | `string`          | -       |

### BreadcrumbEllipsis {#breadcrumbellipsis}

`BreadcrumbEllipsis` 组件为折叠的面包屑条目显示省略标记。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |
