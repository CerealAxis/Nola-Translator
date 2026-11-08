---
title: Alert Dialog（警告对话框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Alert Dialog（警告对话框）

用重要内容打断用户操作，并要求用户作出回应的模态对话框。

<demo react="shadcn-base/alert-dialog-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add alert-dialog
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/alert-dialog.tsx [components/ui/alert-dialog.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
```

```tsx:line-numbers
<AlertDialog>
  <AlertDialogTrigger render={<Button variant="outline" />}>
    Show Dialog
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your account
        from our servers.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## 结构 {#composition}

按以下结构组合 `AlertDialog`：

```text
AlertDialog
├── AlertDialogTrigger
└── AlertDialogContent
    ├── AlertDialogHeader
    │   ├── AlertDialogMedia
    │   ├── AlertDialogTitle
    │   └── AlertDialogDescription
    └── AlertDialogFooter
        ├── AlertDialogCancel
        └── AlertDialogAction
```

## 基础 {#basic}

基础警告对话框，包含标题、说明、取消按钮和继续按钮。

<demo react="shadcn-base/alert-dialog-basic.tsx" />

## 小尺寸 {#small}

使用 `size="sm"` 属性缩小警告对话框。

<demo react="shadcn-base/alert-dialog-small.tsx" />

## 媒体 {#media}

使用 `AlertDialogMedia` 组件为警告对话框添加图标或图像等媒体元素。

<demo react="shadcn-base/alert-dialog-media.tsx" />

## 带媒体的小尺寸对话框 {#small-with-media}

使用 `size="sm"` 属性缩小警告对话框，并使用 `AlertDialogMedia` 组件添加图标或图像等媒体元素。

<demo react="shadcn-base/alert-dialog-small-media.tsx" />

## 危险操作 {#destructive}

使用 `AlertDialogAction` 组件添加危险操作按钮。

<demo react="shadcn-base/alert-dialog-destructive.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/alert-dialog-rtl.tsx" />

## API 参考 {#api-reference}

### size {#size}

使用 `AlertDialogContent` 组件上的 `size` 属性控制警告对话框的尺寸。它接受以下值：

| 属性   | 类型                | 默认值     |
| ------ | ------------------- | ----------- |
| `size` | `"default" \| "sm"` | `"default"` |

有关其他组件及其属性的更多信息，请参阅 [Base UI 文档](https://base-ui.com/react/components/alert-dialog#api-reference)。
