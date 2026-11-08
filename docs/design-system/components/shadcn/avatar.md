---
title: Avatar（头像）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Avatar（头像）

带回退内容的图像元素，用于表示用户。

<demo react="shadcn-base/avatar-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add avatar
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/avatar.tsx [components/ui/avatar.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
```

```tsx:line-numbers
<Avatar>
  <AvatarImage src="https://github.com/shadcn.png" />
  <AvatarFallback>CN</AvatarFallback>
</Avatar>
```

## 结构 {#composition}

按以下结构组合 `Avatar`：

```text
Avatar
├── AvatarImage
├── AvatarFallback
└── AvatarBadge
```

按以下结构组合 `AvatarGroup`：

```text
AvatarGroup
├── Avatar
│   ├── AvatarImage
│   ├── AvatarFallback
│   └── AvatarBadge
├── Avatar
│   ├── AvatarImage
│   ├── AvatarFallback
│   └── AvatarBadge
└── AvatarGroupCount
```

## 基础 {#basic}

基础头像，包含图像和回退内容。

<demo react="shadcn-base/avatar-basic.tsx" />

## 徽章 {#badge}

使用 `AvatarBadge` 组件为头像添加徽章。徽章位于头像的右下角。

<demo react="shadcn-base/avatar-badge.tsx" />

使用 `className` 属性自定义徽章的颜色、尺寸等样式。

```tsx:line-numbers
<Avatar>
  <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
  <AvatarFallback>CN</AvatarFallback>
  <AvatarBadge className="bg-chart-2" />
</Avatar>
```

## 带图标的徽章 {#badge-with-icon}

也可以在 `<AvatarBadge>` 内使用图标。

<demo react="shadcn-base/avatar-badge-icon.tsx" />

## 头像组 {#avatar-group}

使用 `AvatarGroup` 组件添加一组头像。

<demo react="shadcn-base/avatar-group.tsx" />

## 头像组计数 {#avatar-group-count}

使用 `<AvatarGroupCount>` 为头像组添加计数。

<demo react="shadcn-base/avatar-group-count.tsx" />

## 带图标的头像组 {#avatar-group-with-icon}

也可以在 `<AvatarGroupCount>` 内使用图标。

<demo react="shadcn-base/avatar-group-count-icon.tsx" />

## 尺寸 {#sizes}

使用 `size` 属性调整头像尺寸。

<demo react="shadcn-base/avatar-size.tsx" />

## 下拉菜单 {#dropdown}

可以将 `Avatar` 组件用作下拉菜单的触发器。

<demo react="shadcn-base/avatar-dropdown.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/avatar-rtl.tsx" />

## API 参考 {#api-reference}

### Avatar {#avatar}

`Avatar` 是包裹头像图像和回退内容的根组件。

| 属性        | 类型                        | 默认值     |
| ----------- | --------------------------- | ----------- |
| `size`      | `"default" \| "sm" \| "lg"` | `"default"` |
| `className` | `string`                    | -           |

### AvatarImage {#avatarimage}

`AvatarImage` 组件显示头像图像。它接受 Base UI Avatar Image 的所有属性。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `src`       | `string` | -       |
| `alt`       | `string` | -       |
| `className` | `string` | -       |

### AvatarFallback {#avatarfallback}

图像加载失败时，`AvatarFallback` 组件显示回退内容。它接受 Base UI Avatar Fallback 的所有属性。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarBadge {#avatarbadge}

`AvatarBadge` 组件在头像上显示徽章，通常位于右下角。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarGroup {#avatargroup}

`AvatarGroup` 组件将一组头像重叠显示。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarGroupCount {#avatargroupcount}

`AvatarGroupCount` 组件在头像组中显示计数，通常用来表示其余头像的数量。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

有关 Base UI Avatar 属性的更多信息，请参阅 [Base UI 文档](https://base-ui.com/react/components/avatar#api-reference)。
