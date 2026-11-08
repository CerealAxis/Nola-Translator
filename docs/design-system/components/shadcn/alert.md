---
title: Alert（提示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Alert（提示）

显示引起用户注意的提示。

<demo react="shadcn-base/alert-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add alert
```

</template>

<template #manual>

**1. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/alert.tsx [components/ui/alert.tsx]

**2. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
```

```tsx:line-numbers
<Alert>
  <InfoIcon />
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>
    You can add components and dependencies to your app using the cli.
  </AlertDescription>
  <AlertAction>
    <Button variant="outline">Enable</Button>
  </AlertAction>
</Alert>
```

## 结构 {#composition}

按以下结构组合 `Alert`：

```text
Alert
├── Icon
├── AlertTitle
├── AlertDescription
└── AlertAction
```

## 基础 {#basic}

基础提示，包含图标、标题和说明。

<demo react="shadcn-base/alert-basic.tsx" />

## 危险操作 {#destructive}

使用 `variant="destructive"` 创建危险操作提示。

<demo react="shadcn-base/alert-destructive.tsx" />

## 操作 {#action}

使用 `AlertAction` 为提示添加按钮或其他操作元素。

<demo react="shadcn-base/alert-action.tsx" />

## 自定义颜色 {#custom-colors}

可以向 `Alert` 组件添加 `border-chart-4/25 [&>svg]:text-chart-4` 等自定义类来调整提示颜色。

<demo react="shadcn-base/alert-colors.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/alert-rtl.tsx" />

## API 参考 {#api-reference}

### Alert {#alert}

`Alert` 组件显示引起用户注意的提示。

| 属性      | 类型                         | 默认值     |
| --------- | ---------------------------- | ----------- |
| `variant` | `"default" \| "destructive"` | `"default"` |

### AlertTitle {#alerttitle}

`AlertTitle` 组件显示提示的标题。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AlertDescription {#alertdescription}

`AlertDescription` 组件显示提示的说明或内容。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AlertAction {#alertaction}

`AlertAction` 组件显示操作元素（例如按钮），并将其绝对定位到提示的右上角。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |
