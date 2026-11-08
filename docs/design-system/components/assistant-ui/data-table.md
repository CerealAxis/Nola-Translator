---
title: Data table（数据表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Data table（数据表）

用可排序的数据表展示结构化工具结果和应用数据。

当容器变窄时，

DataTable 将 `{ columns, rows }` 结果转换为与区域设置感知值、排序和卡片视图的可访问比较。数据源决定列，而元素拥有格式、顺序和响应式呈现。

<demo react="assistant-ui/data-table-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-data-table"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-data-table.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

使用后端工具返回的相同结果形状。渲染器保持很小，因为工具结果已经描述了标题和值。

### 渲染结果 {#render-the-result}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/assistant-ui/elements/data-table";

type CompareModelsResult = {
  columns: readonly DataTableColumn[];
  rows: readonly DataTableRow[];
};

export const CompareModelsToolUI: ToolCallMessagePartComponent<
  { models: string[] },
  CompareModelsResult
> = ({ result }) =>
  result ? (
    <DataTable
      columns={result.columns}
      rows={result.rows}
      rowKey="id"
      caption="型号对比"
    />
  ) : null;
```

### 注册后端工具 {#register-the-backend-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { CompareModelsToolUI } from "@/components/assistant-ui/elements/compare-models-tool-ui";

export const toolkit = defineToolkit({
  compare_models: {
    type: "backend",
    parameters: z.object({ models: z.array(z.string()) }),
    render: CompareModelsToolUI,
  },
});
```

   后端结果为`{ columns, rows }`。保留原始值或原始值数组，以便渲染器可以按可预测的方式对它们进行格式化和排序。

**独立版**

自己传递相同的有效负载。 `defaultSort` 给出初始顺序，`sort` 和 `onSortChange` 让你的应用程序拥有该状态。

```tsx
"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/assistant-ui/elements/data-table";

const columns = [
  { key: "name", label: "型号", priority: "primary" },
  { key: "context", label: "背景信息", format: { kind: "number", compact: true } },
  { key: "input", label: "输入", format: { kind: "currency", currency: "USD" } },
] as const satisfies readonly DataTableColumn[];

const rows = [
  { id: "sonnet", name: "十四行诗4.5", context: 200_000, input: 3 },
  { id: "gpt", name: "GPT-5", context: 400_000, input: 5 },
];

export function ModelComparison() {
  const [sort, setSort] = useState<DataTableSort | null>({
    key: "context",
    direction: "desc",
  });

  return <DataTable columns={columns} rows={rows} rowKey="id" sort={sort} onSortChange={setSort} caption="型号对比" />;
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="data-table">
  <table>{/* column headers and sortable rows */}</table>
  <div role="list">{/* compact cards for narrow containers */}</div>
</div>
```

根是一个容器。在`@md`，语义表是可见的。在其下方，每一行都成为一张卡片，其中主列作为其标题，其余字段位于定义列表中。两种布局都会呈现，因此 CSS 可以在不更改数据或其排序顺序的情况下进行选择。

该表的标题下方有一条细线。行使用安静的悬停填充而不是分隔线。提供的标题在视觉上是隐藏的，并为表格提供了屏幕阅读器名称。每个可排序的标头都会循环升序、降序，然后取消排序，并在礼貌的实时区域中宣布新的顺序。只有排序的标题带有`aria-sort`，每个排序按钮都以其列命名，例如`Sort by Latency`。

## 示例 {#examples}

### 格式化值 {#format-values}

`format` 使用 `Intl` 和 `locale`，默认为 `"en-US"`。数字格式自动端对齐。空值显示静音 `none` 并最后排序。

```tsx
<DataTable
  locale="en-GB"
  relativeTo={Date.parse("2026-09-26T12:00:00Z")}
  columns={[
    { key: "revenue", label: "收入", format: { kind: "currency", currency: "GBP", compact: true } },
    { key: "conversion", label: "转换", format: { kind: "percent", decimals: 1 } },
    { key: "change", label: "变更", format: { kind: "delta", decimals: 1, unit: "%" } },
    { key: "updated", label: "更新", format: { kind: "date", style: "relative" } },
    { key: "status", label: "状态", format: { kind: "badge", tones: { live: "success", review: "warning" } } },
    { key: "tags", label: "标签", format: { kind: "list", max: 2 } },
  ]}
  rows={report.rows}
/>
```

当百分比以 `12` 而不是 `0.12` 形式到达时，使用 `basis: "unit"`。 `link` 格式从单元格或 `hrefKey` 读取其 href，并且只有 `safeHref` 允许的链接才成为锚点。外部链接使用 `noopener noreferrer` 打开。

当 `relativeTo` 不存在时，相对日期在服务器渲染和恢复作用期间显示为 UTC 绝对日期。安装后，它们使用客户端的时钟切换到相关文本。当共享参考时间很重要时传递 `relativeTo`。日期字符串必须命名真实的日历日期。不可能的值保留其原始文本。

### 自定义排序 {#own-the-sorting}

如果没有 `sort`，DataTable 会在内部保留当前排序。通过`sort`和`onSortChange`来控制它。 `null` 表示源行顺序。数字、布尔值、ISO 日期、列表和字符串都可以进行适当的比较。空值保留在任一方向的末尾。

```tsx
<DataTable columns={columns} rows={rows} sort={sort} onSortChange={setSort} />
```

### 适合狭窄的容器 {#fit-a-narrow-container}

设置一列为`priority: "primary"`，使其成为卡片标题。如果没有列是主列，则使用第一列。次要值变为 `dt` 和 `dd` 对，在隐藏标头时保留标签。

```tsx
<DataTable
  columns={[
    { key: "name", label: "名称", priority: "primary" },
    { key: "latency", label: "延迟", format: { kind: "number", unit: "女士" } },
    { key: "owner", label: "业主" },
  ]}
  rows={rows}
/>
```

## API 参考 {#api-reference}

### 运行时数据表 {#runtime-datatable}

**运行时版**

| 属性 | 类型 | 默认值 | 说明 |
| --------- | ------------------- | --------- | -------------------------------------------------------- |
| `columns` | `DataTableColumn[]` |  | 后端提供的列定义。 |
| `rows` | `DataTableRow[]` |  | 后端为每行提供的值。 |
| `rowKey` | `string` |  | 用作 React 键的行字段。 |
| `caption` | `string` |  | 表格的屏幕阅读器标题。 |
| `locale` | `string` | `"en-US"` | 所有 `Intl` 格式化和字符串排序使用的区域设置。 |

### 独立数据表 {#standalone-datatable}

**独立版**

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `columns` | `readonly DataTableColumn[]` |  | 有序表列。 |
| `rows` | `readonly DataTableRow[]` |  | 源行。 |
| `rowKey` | `string` | 索引 | 用于行键（如果存在）的字段。 |
| `caption` | `string` |  | 视觉上隐藏的表格标题。 |
| `defaultSort` | `{ key, direction }` |  | 初始不受控制的排序。 |
| `sort` | `{ key, direction } \| null` |  | 受控排序。 `null` 恢复源顺序。 |
| `onSortChange` | `(sort) => void` |  | 作为标头在排序状态之间循环调用。 |
| `locale` | `string` | `"en-US"` | 格式化和整理器区域设置。 |
| `emptyMessage` | `string` | `"No rows"` | 空表或卡列表中的消息。 |
| `relativeTo` | `number` | 挂载前的绝对 UTC 日期，然后是客户端的时钟 | 相对日期的纪元毫秒。提供一个共享参考时间。 |
| `className` | `string` |  | 额外的类合并到根元素。 |

### 运行时数据表列 {#runtime-datatablecolumn}

**运行时版**

| 字段 | 类型 | 说明 |
| ---------- | -------------------------- | ------------------------------------------- |
| `key` | `string` | 要读取的行属性。 |
| `label` | `string` | 标头和紧凑卡标签。 |
| `format` | `DataTableFormat` | 价值呈现规则。 |
| `sortable` | `boolean` | 启用标头排序。默认为 `true`。 |
| `priority` | `"primary" \| "secondary"` | 主要数值领先紧凑型卡。 |

### 独立数据表列 {#standalone-datatablecolumn}

**独立版**

| 字段 | 类型 | 说明 |
| ---------- | -------------------------- | ----------------------------------------------- |
| `key` | `string` | 要读取的行属性。 |
| `label` | `string` | 表头和卡片标签。 |
| `format` | `DataTableFormat` | 格式化规则。默认为文本。 |
| `align` | `"start" \| "end"` | 电池对齐。数字格式默认为 end。 |
| `sortable` | `boolean` | 标题交互性。默认为 `true`。 |
| `priority` | `"primary" \| "secondary"` | 卡题选择。 |
| `width` | `string` | 可选桌面表格列宽。 |

### 运行时数据表格式 {#runtime-datatableformat}

**运行时版**

| 实物 | 值 | 说明 |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `text` | 字符串、数字、布尔值、列表 | 纯文本。 |
| `number`, `currency`, `percent`, `delta` | 号 | 区域设置感知数值。 |
| `date` | 有效的 ISO 日历字符串或纪元毫秒 | 日期、日期时间或相对日期。不可能的日历日期保留为原始文本。 |
| `boolean` | 布尔值 | 可配置真假标签。 |
| `link` | 串 | 值或 `hrefKey` 的安全 URL。 |
| `badge`, `list` | 字符串或列表 | 音调标签或有限列表标签。 |

### 独立数据表格式 {#standalone-datatableformat}

**独立版**

| 实物 | 选项 | 说明 |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `text` |  | 纯文本。 |
| `number` | `decimals`, `compact`, `unit` | 带有可选紧凑后缀或单位的编号。 |
| `currency` | `currency`, `decimals`, `compact` | 采用 `Intl.NumberFormat` 格式的货币。 |
| `percent` | `decimals`, `basis` | 默认小数输入，或整单位输入。 |
| `delta` | `decimals`, `unit`, `upIsGood` | 向上或向下箭头后面的变化大小，根据该方向是否良好进行着色。 |
| `date` | `style` | `"date"`、`"datetime"` 或 `"relative"`。 |
| `boolean` | `trueLabel`, `falseLabel` | 显示布尔值的标签。 |
| `link` | `hrefKey` | 当显示值不是 URL 时的安全 href 字段。 |
| `badge` | `tones` | 每个值中性、成功、警告或危险音。 |
| `list` | `max` | `+N` 计数之前的最大可见标签。 |
