---
title: Popover（浮层详情）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Popover（浮层详情）

通过按钮触发，在 Portal 中显示丰富内容。

<demo react="shadcn-base/popover-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add popover
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/popover.tsx [components/ui/popover.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
```

```tsx:line-numbers
<Popover>
  <PopoverTrigger render={<Button variant="outline" />}>
    Open Popover
  </PopoverTrigger>
  <PopoverContent>
    <PopoverHeader>
      <PopoverTitle>Title</PopoverTitle>
      <PopoverDescription>Description text here.</PopoverDescription>
    </PopoverHeader>
  </PopoverContent>
</Popover>
```

## 组件结构 {#composition}

使用以下结构构建 `Popover`：

```text
Popover
├── PopoverTrigger
└── PopoverContent
```

## 基础 {#basic}

带顶部区域、标题和描述的简单弹出框。

<demo react="shadcn-base/popover-basic.tsx" />

## 对齐 {#align}

使用 `PopoverContent` 的 `align` 属性控制水平对齐。

<demo react="shadcn-base/popover-alignments.tsx" />

## 带表单 {#with-form}

包含表单字段的弹出框。

<demo react="shadcn-base/popover-form.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/popover-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Popover](https://base-ui.com/react/components/popover#api-reference) 文档。
