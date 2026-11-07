---
title: Table（表格）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Table（表格）

响应式表格组件。

<demo react="shadcn-base/table-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add table
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/table.tsx [components/ui/table.tsx]

**2. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
```

```tsx:line-numbers
<Table>
  <TableCaption>A list of your recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead className="w-[100px]">Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Method</TableHead>
      <TableHead className="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="font-medium">INV001</TableCell>
      <TableCell>Paid</TableCell>
      <TableCell>Credit Card</TableCell>
      <TableCell className="text-right">$250.00</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## 组件结构 {#composition}

使用以下结构构建 `Table`：

```text
Table
├── TableCaption
├── TableHeader
│   └── TableRow
│       ├── TableHead
│       ├── TableHead
│       ├── TableHead
│       └── TableHead
├── TableBody
│   ├── TableRow
│   │   ├── TableCell
│   │   ├── TableCell
│   │   ├── TableCell
│   │   └── TableCell
│   └── TableRow
│       ├── TableCell
│       ├── TableCell
│       ├── TableCell
│       └── TableCell
└── TableFooter
```

## 表尾 {#footer}

使用 `<TableFooter />` 组件为表格添加表尾。

<demo react="shadcn-base/table-footer.tsx" />

## 操作 {#actions}

使用 `<DropdownMenu />` 组件为表格的每一行显示可用操作。

<demo react="shadcn-base/table-actions.tsx" />

## 数据表格 {#data-table}

你可以用 `<Table />` 组件构建更复杂的数据表格。结合 [@tanstack/react-table](https://tanstack.com/table/latest)，即可实现排序、筛选和分页。

更多信息请参阅[数据表格](https://ui.shadcn.com/docs/components/data-table)文档。

也可在[任务](https://ui.shadcn.com/examples/tasks)演示中查看数据表格示例。

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/table-rtl.tsx" />
