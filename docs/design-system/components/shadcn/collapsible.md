---
title: Collapsible（局部展开）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Collapsible（局部展开）

用于展开或折叠面板的交互式组件。

<demo react="shadcn-base/collapsible-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add collapsible
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/collapsible.tsx [components/ui/collapsible.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
```

```tsx:line-numbers
<Collapsible>
  <CollapsibleTrigger>Can I use this in my project?</CollapsibleTrigger>
  <CollapsibleContent>
    Yes. Free to use for personal and commercial projects. No attribution
    required.
  </CollapsibleContent>
</Collapsible>
```

## 结构 {#composition}

按以下结构组合 `Collapsible`：

```text
Collapsible
├── CollapsibleTrigger
└── CollapsibleContent
```

## 受控状态 {#controlled-state}

使用 `open` 和 `onOpenChange` 属性控制状态。

```tsx:line-numbers
import * as React from "react"

export function Example() {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent>Content</CollapsibleContent>
    </Collapsible>
  )
}
```

## 基础 {#basic}

<demo react="shadcn-base/collapsible-basic.tsx" />

## 设置面板 {#settings-panel}

使用触发按钮显示更多设置。

<demo react="shadcn-base/collapsible-settings.tsx" />

## 文件树 {#file-tree}

使用嵌套的可折叠组件构建文件树。在对话中，这称为[文件树](https://ui.shadcn.com/docs/ai-elements/base/file-tree)模式。

<demo react="shadcn-base/collapsible-file-tree.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/collapsible-rtl.tsx" />

## API 参考 {#api-reference}

更多信息请参阅 [Base UI](https://base-ui.com/react/components/collapsible#api-reference) 文档。
