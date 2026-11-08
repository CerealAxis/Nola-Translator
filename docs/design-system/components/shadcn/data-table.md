---
title: Data Table（数据表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Data Table（数据表）

使用 TanStack Table 构建的功能强大的表格和数据网格。

<demo react="shadcn-base/data-table-demo.tsx" />

## 简介 {#introduction}

我创建过的每张数据表格或数据网格都各不相同。它们的行为不同，有各自的排序和筛选要求，使用的数据源也不同。

把所有这些变化都塞进一个组件并不合适。那样会丧失 [headless UI](https://tanstack.com/table/latest/docs/overview#what-is-headless-ui) 带来的灵活性。

因此，我想提供一份指南，帮助你自行构建数据表格，比直接提供数据表格组件更有用。

我们会从基础的 `<Table />` 组件开始，从头构建一张复杂的数据表格。

<div class="shadcn-doc-callout">

**提示：** 如果你在应用的多个地方使用同一张表格，随时可以将它提取成可复用的组件。

</div>

## 目录 {#table-of-contents}

本指南将介绍如何用 [TanStack Table](https://tanstack.com/table) 和 `<Table />` 组件构建自己的数据表格，涵盖以下主题：

- [设置表格功能](#set-up-table-features)
- [基础表格](#basic-table)
- [行操作](#row-actions)
- [分页](#pagination)
- [排序](#sorting)
- [筛选](#filtering)
- [可见性](#visibility)
- [行选择](#row-selection)
- [可复用组件](#reusable-components)

## 安装 {#installation}

1. 将 `<Table />` 组件添加到项目中：

```bash
npx shadcn@latest add table
```

2. 添加 `@tanstack/react-table` 依赖。本指南使用 **TanStack Table v9**：

```bash
npm install @tanstack/react-table
```

## 前提条件 {#prerequisites}

我们要构建一张显示近期付款的表格，数据如下：

```tsx:line-numbers
type Payment = {
  id: string
  amount: number
  status: "pending" | "processing" | "success" | "failed"
  email: string
}

export const payments: Payment[] = [
  {
    id: "728ed52f",
    amount: 100,
    status: "pending",
    email: "m@example.com",
  },
  {
    id: "489e1d42",
    amount: 125,
    status: "processing",
    email: "example@gmail.com",
  },
  // ...
]
```

## 项目结构 {#project-structure}

先创建以下文件结构：

```txt
app
└── payments
    ├── columns.tsx
    ├── data-table-features.ts
    ├── data-table.tsx
    └── page.tsx
```

这里以 Next.js 为例，同样适用于其他 React 框架。

- `columns.tsx`（客户端组件）包含列定义。
- `data-table-features.ts` 包含共享的 `features` 对象，告诉 TanStack Table 要启用哪些行为。
- `data-table.tsx`（客户端组件）包含我们的 `<DataTable />` 组件。
- `page.tsx`（服务端组件）负责获取数据并渲染表格。

## 设置表格功能 {#set-up-table-features}

TanStack Table v9 按功能启用。使用 `tableFeatures()` 声明所需行为，例如排序、筛选和分页。未列出的功能都会在打包时通过 tree-shaking 移除，内置筛选函数和排序函数也是如此。请在 `filterFns` 和 `sortFns` 中注册各列所依赖的函数（本例使用 `includesString` 筛选电子邮件，用 `text` / `alphanumeric` 为字符串列排序）。

```tsx:line-numbers [app/payments/data-table-features.ts]
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table"

// New in v9: declare the features this table uses — anything you don't
// register is tree-shaken out of the bundle.
export const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

// Pass this as the first generic argument to `ColumnDef`, `Column`, `Table`,
// and `Row` so each type knows which feature APIs are available.
export type DataTableFeatures = typeof features
```

<div class="shadcn-doc-callout">

**注意：** 核心行模型始终包含在内，无需自行注册。可选功能的行模型通过 `create*RowModel()` 创建，再注册到功能对象上，表格选项中已移除 `get*RowModel`。

</div>

## 基础表格 {#basic-table}

先来构建一张基础表格。

### 列定义 {#column-definitions}

首先定义各列。

```tsx:line-numbers{3,5,16-17,19-29} [app/payments/columns.tsx]
"use client"

import { createColumnHelper } from "@tanstack/react-table"

import { type DataTableFeatures } from "./data-table-features"

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Payment = {
  id: string
  amount: number
  status: "pending" | "processing" | "success" | "failed"
  email: string
}

// Use `accessor` for data columns and `display` for columns without one.
const columnHelper = createColumnHelper<DataTableFeatures, Payment>()

export const columns = columnHelper.columns([
  columnHelper.accessor("status", {
    header: "Status",
  }),
  columnHelper.accessor("email", {
    header: "Email",
  }),
  columnHelper.accessor("amount", {
    header: "Amount",
  }),
])
```

<div class="shadcn-doc-callout">

**注意：** 列定义决定表格的核心呈现。
它们指定显示哪些数据，以及如何
格式化、排序和筛选这些数据。

</div>

### `<DataTable />` 组件 {#datatable-component}

接下来创建一个 `<DataTable />` 组件，用它渲染表格。

```tsx:line-numbers [app/payments/data-table.tsx]
"use client"

import { useTable, type ColumnDef, type RowData } from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { features, type DataTableFeatures } from "./data-table-features"

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
}

export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const table = useTable({
    features,
    data,
    columns,
  })

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

<div class="shadcn-doc-callout">

**提示**：如果在多个地方使用 `<DataTable />`，可以将此组件提取到 `components/ui/data-table.tsx`，以便复用。

`<DataTable columns={columns} data={data} />`

</div>

<div class="shadcn-doc-callout">

**`<table.FlexRender />` 与 `flexRender` 的区别：** 本指南使用 v9 的 `<table.FlexRender header={header} />` 和 `<table.FlexRender cell={cell} />` 组件，可直接通过表格实例访问，无需额外导入。v8 的经典辅助函数 `flexRender(component, context)` 仍可使用，适合偏好函数形式，或需要在持有 `table` 的组件之外进行渲染的场景。后者也可导入独立的 `<FlexRender />`。

</div>

### 渲染表格 {#render-the-table}

最后，在页面组件中渲染表格。

```tsx:line-numbers{22} [app/payments/page.tsx]
import { columns, Payment } from "./columns"
import { DataTable } from "./data-table"

async function getData(): Promise<Payment[]> {
  // Fetch data from your API here.
  return [
    {
      id: "728ed52f",
      amount: 100,
      status: "pending",
      email: "m@example.com",
    },
    // ...
  ]
}

export default async function DemoPage() {
  const data = await getData()

  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={data} />
    </div>
  )
}
```

## 单元格格式化 {#cell-formatting}

设置金额单元格的格式，使其显示美元金额，并将单元格右对齐。

### 更新列定义 {#update-columns-definition}

按如下方式更新金额列的 `header` 和 `cell` 定义：

```tsx:line-numbers{3-13} [app/payments/columns.tsx]
export const columns = columnHelper.columns([
  columnHelper.accessor("amount", {
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"))
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount)

      return <div className="text-right font-medium">{formatted}</div>
    },
  }),
])
```

可以用同样的方法格式化其他单元格和表头。

## 行操作 {#row-actions}

为表格添加行操作。这里使用 `<DropdownMenu />` 组件。

### 更新列定义 {#update-columns-definition-1}

更新列定义，添加新的 `actions` 列。`actions` 单元格返回 `<DropdownMenu />` 组件。

```tsx:line-numbers{4,6-14,18-45} [app/payments/columns.tsx]
"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const columns = columnHelper.columns([
  // ...
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => {
      const payment = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-8 w-8 p-0" />}
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(payment.id)}
            >
              Copy payment ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View customer</DropdownMenuItem>
            <DropdownMenuItem>View payment details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }),
  // ...
])
```

在 `cell` 函数中，可以通过 `row.original` 访问行数据，用它处理行操作，例如通过 `id` 向 API 发起 DELETE 请求。

## 分页 {#pagination}

接下来为表格添加分页。

### 分页已启用 {#pagination-is-already-enabled}

功能对象包含 `rowPaginationFeature` 和 `createPaginatedRowModel()`，因此表格会自动分页，每页 10 行，无需在 `useTable` 中添加设置。有关自定义每页行数和实现手动分页的更多信息，请参阅[分页文档](https://tanstack.com/table/latest/docs/framework/react/guide/pagination)。

### 添加分页控件 {#add-pagination-controls}

可以使用 `<Button />` 组件以及 `table.previousPage()`、`table.nextPage()` API 方法，为表格添加分页控件。

```tsx:line-numbers{1,20-37} [app/payments/data-table.tsx]
import { Button } from "@/components/ui/button"

export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const table = useTable({
    features,
    data,
    columns,
  })

  return (
    <div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          { // .... }
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
```

更高级的分页组件请参阅[可复用组件](#reusable-components)一节。

## 排序 {#sorting}

让电子邮件列可以排序。

功能对象已注册 `rowSortingFeature` 和排序后的行模型，只需接入排序状态。

### 更新 `<DataTable>` {#update-datatable}

```tsx:line-numbers{3,8,15,21-24} [app/payments/data-table.tsx]
"use client"

import * as React from "react"
import {
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"

export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <div>
      <div className="overflow-hidden rounded-md border">
        <Table>{ ... }</Table>
      </div>
    </div>
  )
}
```

### 让表头单元格可排序 {#make-header-cell-sortable}

现在可以更新 `email` 表头单元格，加入排序控件。

```tsx:line-numbers{4,8-18} [app/payments/columns.tsx]
"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"

export const columns = columnHelper.columns([
  columnHelper.accessor("email", {
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Email
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  }),
])
```

用户切换表头单元格时，表格会自动按升序或降序排序。

## 筛选 {#filtering}

添加搜索输入框，用于筛选表格中的电子邮件。

功能对象已包含 `columnFilteringFeature` 和筛选后的行模型，因此只需接入筛选状态并渲染输入框。

### 更新 `<DataTable>` {#update-datatable-1}

```tsx:line-numbers{7,13,20-22,29,32,38-46} [app/payments/data-table.tsx]
"use client"

import * as React from "react"
import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter emails..."
          value={(table.getColumn("email")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("email")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>{ ... }</Table>
      </div>
    </div>
  )
}
```

`email` 列现已启用筛选。也可以为其他列添加筛选器。有关自定义筛选器的更多信息，请参阅[筛选文档](https://tanstack.com/table/latest/docs/framework/react/guide/column-filtering)。

## 可见性 {#visibility}

使用 `@tanstack/react-table` 的可见性 API，可以轻松控制列的显示和隐藏。

### 更新 `<DataTable>` {#update-datatable-2}

```tsx:line-numbers{8,14-19,29-30,38,42,57-84} [app/payments/data-table.tsx]
"use client"

import * as React from "react"
import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({})

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  return (
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter emails..."
          value={table.getColumn("email")?.getFilterValue() as string}
          onChange={(event) =>
            table.getColumn("email")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="ml-auto" />}>
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter(
                (column) => column.getCanHide()
              )
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>{ ... }</Table>
      </div>
    </div>
  )
}
```

这会添加一个下拉菜单，用于切换列的可见性。

## 行选择 {#row-selection}

接下来为表格添加行选择。

### 更新列定义 {#update-column-definitions}

```tsx:line-numbers{6,9-30} [app/payments/columns.tsx]
"use client"

import { createColumnHelper } from "@tanstack/react-table"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

export const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }),
])
```

### 更新 `<DataTable>` {#update-datatable-3}

```tsx:line-numbers{11,20,25} [app/payments/data-table.tsx]
export function DataTable<TData extends RowData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div>
      <div className="overflow-hidden rounded-md border">
        <Table />
      </div>
    </div>
  )
}
```

这会为每一行添加复选框，并在表头添加一个用于选择所有行的复选框。

### 显示已选行数 {#show-selected-rows}

可以用 `table.getFilteredSelectedRowModel()` API 显示已选行数。

```tsx
<div className="flex-1 text-sm text-muted-foreground">
  {table.getFilteredSelectedRowModel().rows.length} of{" "}
  {table.getFilteredRowModel().rows.length} row(s) selected.
</div>
```

## 可复用组件 {#reusable-components}

以下是可用于构建数据表格的组件，来自[任务](https://ui.shadcn.com/examples/tasks)演示。该演示通过 `data-table-features.ts` 模块在各组件之间共享功能对象及其对应的 `TasksTableFeatures` 类型，采用的正是[设置表格功能](#set-up-table-features)中介绍的模式。

### 列标题 {#column-header}

让任意列标题可排序、可隐藏。

<<< @/media-src/vis/shadcn-base/app/(app)/examples/tasks/components/data-table-column-header.tsx [components/data-table-column-header.tsx]

```tsx:line-numbers{4}
export const columns = columnHelper.columns([
  columnHelper.accessor("email", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
  }),
])
```

### 分页 {#pagination-1}

为表格添加分页控件，包括每页行数和所选行数。

<<< @/media-src/vis/shadcn-base/app/(app)/examples/tasks/components/data-table-pagination.tsx

```tsx
<DataTablePagination table={table} />
```

### 列显示开关 {#column-toggle}

用于切换列可见性的组件。

<<< @/media-src/vis/shadcn-base/app/(app)/examples/tasks/components/data-table-view-options.tsx

```tsx
<DataTableViewOptions table={table} />
```

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/data-table-rtl.tsx" />
