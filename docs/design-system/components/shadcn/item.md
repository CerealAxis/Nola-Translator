---
title: Item（条目）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Item（条目）

用于显示媒体、标题、描述和操作的通用组件。

<demo react="shadcn-base/item-demo.tsx" />

`Item` 组件是一个简单的 Flex 容器，可容纳几乎任何类型的内容。使用它显示标题、描述和操作。搭配 `ItemGroup` 组件可创建条目列表。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add item
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/item.tsx [components/ui/item.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
```

```tsx:line-numbers
<Item>
  <ItemMedia variant="icon">
    <Icon />
  </ItemMedia>
  <ItemContent>
    <ItemTitle>Title</ItemTitle>
    <ItemDescription>Description</ItemDescription>
  </ItemContent>
  <ItemActions>
    <Button>Action</Button>
  </ItemActions>
</Item>
```

## 组件结构 {#composition}

使用以下结构构建 `Item`：

```text
ItemGroup
└── Item
    ├── ItemHeader
    ├── ItemMedia
    ├── ItemContent
    │   ├── ItemTitle
    │   └── ItemDescription
    ├── ItemActions
    └── ItemFooter
```

## Item 与 Field 的区别 {#item-vs-field}

需要显示复选框、输入框、单选框或选择器等表单控件时，使用 `Field`。

只需要展示标题、描述、操作等内容时，使用 `Item`。

## 变体 {#variant}

使用 `variant` 属性更改条目的视觉样式。

<demo react="shadcn-base/item-variant.tsx" />

## 尺寸 {#size}

使用 `size` 属性更改条目的尺寸。可选尺寸为 `default`、`sm` 和 `xs`。

<demo react="shadcn-base/item-size.tsx" />

## 图标 {#icon}

在 `ItemMedia` 上设置 `variant="icon"` 显示图标。

<demo react="shadcn-base/item-icon.tsx" />

## 头像 {#avatar}

可以在 `ItemMedia` 上设置 `variant="avatar"` 显示头像。

<demo react="shadcn-base/item-avatar.tsx" />

## 图片 {#image}

在 `ItemMedia` 上设置 `variant="image"` 显示图片。

<demo react="shadcn-base/item-image.tsx" />

## 分组 {#group}

使用 `ItemGroup` 将相关条目归为一组。

<demo react="shadcn-base/item-group.tsx" />

## 顶部 {#header}

使用 `ItemHeader` 在条目内容上方添加顶部区域。

<demo react="shadcn-base/item-header.tsx" />

## 链接 {#link}

使用 `render` 属性将条目渲染为链接。悬停和焦点状态将应用于锚点元素。

<demo react="shadcn-base/item-link.tsx" />

```tsx:line-numbers
<Item render={<a href="/dashboard" />}>
  <ItemMedia variant="icon">
    <HomeIcon />
  </ItemMedia>
  <ItemContent>
    <ItemTitle>Dashboard</ItemTitle>
    <ItemDescription>Overview of your account and activity.</ItemDescription>
  </ItemContent>
</Item>
```

## 下拉菜单 {#dropdown}

<demo react="shadcn-base/item-dropdown.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/item-rtl.tsx" />

## API 参考 {#api-reference}

### Item {#item}

用于显示媒体、标题、描述和操作的主组件。

| 属性      | 类型                                | 默认值     |
| --------- | ----------------------------------- | ----------- |
| `variant` | `"default" \| "outline" \| "muted"` | `"default"` |
| `size`    | `"default" \| "sm" \| "xs"`         | `"default"` |
| `render`  | `React.ReactElement`                |             |

### ItemGroup {#itemgroup}

将相关条目分组并应用统一样式的容器。

```tsx
<ItemGroup>
  <Item />
  <Item />
</ItemGroup>
```

### ItemSeparator {#itemseparator}

用于分隔组内条目。

```tsx
<ItemGroup>
  <Item />
  <ItemSeparator />
  <Item />
</ItemGroup>
```

### ItemMedia {#itemmedia}

使用 `ItemMedia` 显示图标、图片或头像等媒体内容。

| 属性      | 类型                             | 默认值     |
| --------- | -------------------------------- | ----------- |
| `variant` | `"default" \| "icon" \| "image"` | `"default"` |

```tsx
<ItemMedia variant="icon">
  <Icon />
</ItemMedia>
```

```tsx
<ItemMedia variant="image">
  <img src="..." alt="..." />
</ItemMedia>
```

### ItemContent {#itemcontent}

包裹条目的标题和描述。

```tsx
<ItemContent>
  <ItemTitle>Title</ItemTitle>
  <ItemDescription>Description</ItemDescription>
</ItemContent>
```

### ItemTitle {#itemtitle}

显示条目标题。

```tsx
<ItemTitle>Item Title</ItemTitle>
```

### ItemDescription {#itemdescription}

显示条目描述。

```tsx
<ItemDescription>Item description</ItemDescription>
```

### ItemActions {#itemactions}

用于放置操作按钮或其他交互元素的容器。

```tsx
<ItemActions>
  <Button>Action</Button>
</ItemActions>
```

### ItemHeader {#itemheader}

在条目内容上方显示顶部区域。

```tsx
<Item>
  <ItemHeader>Header</ItemHeader>
  <ItemContent>...</ItemContent>
</Item>
```

### ItemFooter {#itemfooter}

在条目内容下方显示底部区域。

```tsx
<Item>
  <ItemContent>...</ItemContent>
  <ItemFooter>Footer</ItemFooter>
</Item>
```
