---
title: Accordion（折叠组）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Accordion（折叠组）

一组纵向堆叠的交互式标题，每个标题可展开一段内容。

<demo react="shadcn-base/accordion-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add accordion
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/accordion.tsx [components/ui/accordion.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
```

```tsx:line-numbers
<Accordion defaultValue={["item-1"]}>
  <AccordionItem value="item-1">
    <AccordionTrigger>Is it accessible?</AccordionTrigger>
    <AccordionContent>
      Yes. It adheres to the WAI-ARIA design pattern.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

## 结构 {#composition}

按以下结构组合 `Accordion`：

```text
Accordion
├── AccordionItem
│   ├── AccordionTrigger
│   └── AccordionContent
└── AccordionItem
    ├── AccordionTrigger
    └── AccordionContent
```

## 基础 {#basic}

基础手风琴每次只展开一项，默认展开第一项。

<demo react="shadcn-base/accordion-basic.tsx" />

## 多项展开 {#multiple}

使用 `multiple` 属性允许同时展开多个条目。

<demo react="shadcn-base/accordion-multiple.tsx" />

## 禁用 {#disabled}

在 `AccordionItem` 上使用 `disabled` 属性可禁用单个条目。

<demo react="shadcn-base/accordion-disabled.tsx" />

## 边框 {#borders}

为 `Accordion` 添加 `border`，并为 `AccordionItem` 添加 `border-b last:border-b-0`，即可给条目加上边框。

<demo react="shadcn-base/accordion-borders.tsx" />

## 卡片 {#card}

用 `Card` 组件包裹 `Accordion`。

<demo react="shadcn-base/accordion-card.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/accordion-rtl.tsx" />

## API 参考 {#api-reference}

更多信息请参阅 [Base UI](https://base-ui.com/react/components/accordion#api-reference) 文档。
