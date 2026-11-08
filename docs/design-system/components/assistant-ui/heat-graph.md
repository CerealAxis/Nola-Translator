---
title: Heat graph（热力图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Heat graph（热力图）

用热力格呈现每日活动数量，包含月份、星期、图例和提示。

<demo react="assistant-ui/heat-graph-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/heat-graph"
```

## 快速开始 {#getting-started}

运行时不统计每日活动数量，因此 `HeatGraph` 直接接收应用提供的每日计数。

### 传入每日计数 {#pass-counted-days-in}

每项的 `date` 接收 ISO 日期字符串或 `Date`；`count` 的单位由应用决定。组件将计数分为五档。

```tsx
import { HeatGraph } from "@/components/assistant-ui/elements/heat-graph";

const data = [
  { date: "2026-01-01", count: 3 },
  { date: "2026-01-02", count: 0 },
  { date: new Date(2026, 0, 3), count: 7 },
];

export function Activity() {
  return <HeatGraph data={data} />;
}
```

### 显示范围跟随数据或今天 {#the-visible-window-follows-the-data-then-today}

服务端渲染和水合期间，网格以最新有效日期为终点，向前覆盖 365 天并对齐周起点。没有有效日期时初始网格为空。挂载后改为以今天为终点，窗口外的记录不显示。

## 结构 {#anatomy}

网格从周一开始，每列一周；月份标签对齐该月第一个开始的周，星期标签隔行显示。窄容器内可以横向滚动。图例显示五档颜色，窗口内没有正数时只显示一档。悬停格子可查看日期和计数。

```tsx
<div>
  <div>{/* month abbreviations, positioned over the grid's columns */}</div>
  <div>
    <div>{/* weekday abbreviations, every other row */}</div>
    <div>{/* the cell grid, one column per week */}</div>
  </div>
  <div>{/* "Less" ... five legend swatches ... "More" */}</div>
  <div>{/* hover tooltip: count and date */}</div>
</div>
```

## 示例 {#examples}

可直接调整热力图组成，也可以结合目录里的活动图示例了解布局。

### 直接调整组成 {#editing-the-composition-directly}

`HeatGraph` 只接收 `data`，不提供 `start`、`end`、`className` 或配色属性。需要改日期范围、颜色或周起点时，直接组合 `heat-graph` 的 `Root`、`MonthLabels`、`DayLabels`、`Grid`、`Cell`、`Legend`、`LegendLevel` 和 `Tooltip`。

```tsx
<HeatGraphPrimitive.Root data={data} weekStart="sunday" classify={HeatGraphPrimitive.autoLevels(2)} colorScale={["#eee", "#0a5"]}>
  {/* your own MonthLabels / DayLabels / Grid / Legend, or a subset of them */}
</HeatGraphPrimitive.Root>
```

### 目录中的另一种组合 {#a-second-composition-elsewhere-in-the-catalog}

[Activity graph（活动图）](/vis/components/assistant-ui/activity-graph) 展示活动数据的另一种布局。

## API 参考 {#api-reference}

以日期和计数为基础输入，根据布局配置其他显示项。

### HeatGraph {#heatgraph}

必填的 `data` 类型是 `DataPoint[]`，每项形如 `{ date: string | Date; count: number }`。数组中缺失的日期以最低色阶显示。
