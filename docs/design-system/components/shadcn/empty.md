---
title: Empty（空状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Empty（空状态）

使用 Empty 组件显示空状态。

<demo react="shadcn-base/empty-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add empty
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/empty.tsx [components/ui/empty.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
```

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <Icon />
    </EmptyMedia>
    <EmptyTitle>No data</EmptyTitle>
    <EmptyDescription>No data found</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Add data</Button>
  </EmptyContent>
</Empty>
```

## 组件结构 {#composition}

使用以下结构构建 `Empty` 空状态：

```text
Empty
├── EmptyHeader
│   ├── EmptyMedia
│   ├── EmptyTitle
│   └── EmptyDescription
└── EmptyContent
```

## 边框 {#outline}

使用 `border` 工具类创建带边框的空状态。

<demo react="shadcn-base/empty-outline.tsx" />

## 背景 {#background}

使用 `bg-*` 和 `bg-gradient-*` 工具类为空状态添加背景。

<demo react="shadcn-base/empty-background.tsx" />

## 头像 {#avatar}

使用 `EmptyMedia` 组件在空状态中显示头像。

<demo react="shadcn-base/empty-avatar.tsx" />

## 头像组 {#avatar-group}

使用 `EmptyMedia` 组件在空状态中显示头像组。

<demo react="shadcn-base/empty-avatar-group.tsx" />

## InputGroup {#inputgroup}

可以在 `EmptyContent` 组件中添加 `InputGroup` 组件。

<demo react="shadcn-base/empty-input-group.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/empty-rtl.tsx" />

## API 参考 {#api-reference}

### Empty {#empty}

空状态的主组件，包裹 `EmptyHeader` 和 `EmptyContent` 组件。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<Empty>
  <EmptyHeader />
  <EmptyContent />
</Empty>
```

### EmptyHeader {#emptyheader}

`EmptyHeader` 组件包裹空状态中的媒体、标题和描述。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<EmptyHeader>
  <EmptyMedia />
  <EmptyTitle />
  <EmptyDescription />
</EmptyHeader>
```

### EmptyMedia {#emptymedia}

使用 `EmptyMedia` 组件在空状态中展示图标、图片等媒体，也可以用它展示头像等其他组件。

| 属性        | 类型                  | 默认值   |
| ----------- | --------------------- | --------- |
| `variant`   | `"default" \| "icon"` | `default` |
| `className` | `string`              |           |

```tsx
<EmptyMedia variant="icon">
  <Icon />
</EmptyMedia>
```

```tsx
<EmptyMedia>
  <Avatar>
    <AvatarImage src="..." />
    <AvatarFallback>CN</AvatarFallback>
  </Avatar>
</EmptyMedia>
```

### EmptyTitle {#emptytitle}

使用 `EmptyTitle` 组件显示空状态的标题。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<EmptyTitle>No data</EmptyTitle>
```

### EmptyDescription {#emptydescription}

使用 `EmptyDescription` 组件显示空状态的描述。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<EmptyDescription>You do not have any notifications.</EmptyDescription>
```

### EmptyContent {#emptycontent}

使用 `EmptyContent` 组件显示空状态的内容，例如按钮、输入框或链接。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` |         |

```tsx
<EmptyContent>
  <Button>Add Project</Button>
</EmptyContent>
```
