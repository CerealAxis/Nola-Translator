---
title: Dialog（对话框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Dialog（对话框）

覆盖主窗口或另一个对话框的窗口，使下方内容无法交互。

<demo react="shadcn-base/dialog-demo.tsx" />

*用于编辑个人资料的对话框。*

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add dialog
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/dialog.tsx [components/ui/dialog.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
```

```tsx:line-numbers
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you absolutely sure?</DialogTitle>
      <DialogDescription>
        This action cannot be undone. This will permanently delete your account
        and remove your data from our servers.
      </DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

## 组件结构 {#composition}

使用以下结构构建 `Dialog`：

```text
Dialog
├── DialogTrigger
└── DialogContent
    ├── DialogHeader
    │   ├── DialogTitle
    │   └── DialogDescription
    └── DialogFooter
```

## 自定义关闭按钮 {#custom-close-button}

使用自定义按钮替换默认关闭控件。

<demo react="shadcn-base/dialog-close-button.tsx" />

## 隐藏关闭按钮 {#no-close-button}

使用 `showCloseButton={false}` 隐藏关闭按钮。

<demo react="shadcn-base/dialog-no-close-button.tsx" />

## 吸附底栏 {#sticky-footer}

滚动内容时，操作按钮保持可见。

<demo react="shadcn-base/dialog-sticky-footer.tsx" />

## 可滚动内容 {#scrollable-content}

内容较长时可滚动，顶部栏始终可见。

<demo react="shadcn-base/dialog-scrollable-content.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/dialog-rtl.tsx" />

## API 参考 {#api-reference}

详情请参阅 [Base UI](https://base-ui.com/react/components/dialog#api-reference) 文档。
