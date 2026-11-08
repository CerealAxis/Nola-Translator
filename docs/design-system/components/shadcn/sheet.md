---
title: Sheet（侧边面板）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Sheet（侧边面板）

扩展 Dialog 组件，用于显示补充屏幕主要内容的信息。

<demo react="shadcn-base/sheet-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add sheet
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/sheet.tsx [components/ui/sheet.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
```

```tsx:line-numbers
<Sheet>
  <SheetTrigger>Open</SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Are you absolutely sure?</SheetTitle>
      <SheetDescription>This action cannot be undone.</SheetDescription>
    </SheetHeader>
  </SheetContent>
</Sheet>
```

## 组件结构 {#composition}

使用以下结构构建 `Sheet`：

```text
Sheet
├── SheetTrigger
└── SheetContent
    ├── SheetHeader
    │   ├── SheetTitle
    │   └── SheetDescription
    └── SheetFooter
```

## 边缘 {#side}

在 `SheetContent` 上使用 `side` 属性设置侧边面板出现的屏幕边缘。可选值为 `top`、`right`、`bottom` 或 `left`。

<demo react="shadcn-base/sheet-side.tsx" />

## 隐藏关闭按钮 {#no-close-button}

在 `SheetContent` 上设置 `showCloseButton={false}` 以隐藏关闭按钮。

<demo react="shadcn-base/sheet-no-close-button.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/sheet-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Dialog](https://base-ui.com/react/components/dialog#api-reference) 文档。
