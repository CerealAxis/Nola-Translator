---
title: Chart（图表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Chart（图表）

基于 Recharts 构建的美观图表，可复制粘贴到应用中。

<div class="shadcn-doc-callout">

**已更新：** `chart` 组件现在使用 Recharts v3。如果要升级现有图表代码，请参阅[更新到 Recharts v3](#updating-to-recharts-v3)。

</div>

<demo react="shadcn-base/chart-demo.tsx" />

来认识一下 **Charts**。这是一组可复制粘贴到应用中的图表组件。

图表开箱即有美观的样式。它们能与其他组件搭配使用，也可根据项目需求完全自定义。

[浏览图表库](https://ui.shadcn.com/charts)。

## 组件 {#component}

底层使用 [Recharts](https://recharts.org/)。

`chart` 组件围绕组合设计。**使用 Recharts 组件构建图表，仅在需要的地方引入 `ChartTooltip` 等自定义组件**。

```tsx:line-numbers
import { Bar, BarChart } from "recharts"

import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"

export function MyChart() {
  return (
    <ChartContainer>
      <BarChart data={data}>
        <Bar dataKey="value" />
        <ChartTooltip content={<ChartTooltipContent />} />
      </BarChart>
    </ChartContainer>
  )
}
```

组件直接使用 Recharts，因此你可以自由使用其 API。当 Recharts 发布新版本时，你可以按照官方升级指引更新图表。

**这些组件归你所有**。

## 更新到 Recharts v3 {#updating-to-recharts-v3}

如果要将旧版图表代码更新到 Recharts v3：

- 通过 CSS 变量引用图表 token 时，用 `var(--chart-1)` 代替 `hsl(var(--chart-1))`。
- 仅使用 `ChartTooltip.defaultIndex` 设置工具提示的初始状态。在自己的图表状态中保存需持续高亮的图形。
- 当父组件 `<BarChart>` 已定义 `layout` 时，从 `<Bar>` 移除此属性。
- 为 `ChartContainer` 保留高度、`min-h-*` 或 `aspect-*`，以便 `ResponsiveContainer` 在首次渲染时测量尺寸。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add chart
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install recharts
```

**2. 将以下代码复制到 `components/ui/chart.tsx`。**

<<< @/media-src/vis/shadcn-base/ui/chart.tsx [components/ui/chart.tsx]

**3. 将以下颜色添加到 CSS 文件**

```css:line-numbers [app/globals.css]
@layer base {
  :root {
    --chart-1: oklch(0.6007 0.1903 257.9419);
    --chart-2: oklch(0.6369 0.1247 171.0112);
    --chart-3: oklch(0.5495 0.2003 300.1164);
    --chart-4: oklch(0.6806 0.1901 45.0513);
    --chart-5: oklch(0.6198 0.2297 5.1656);
  }

  .dark {
    --chart-1: oklch(0.6496 0.1885 257.7207);
    --chart-2: oklch(0.6943 0.1346 171.9868);
    --chart-3: oklch(0.6203 0.1997 300.1454);
    --chart-4: oklch(0.7171 0.1878 45.3388);
    --chart-5: oklch(0.6604 0.2297 5.1368);
  }
}
```

</template>

</ShadcnInstall>

## 第一个图表 {#your-first-chart}

来构建你的第一个图表。我们将创建柱状图，并添加网格、坐标轴、工具提示和图例。

**1. 先定义数据**

以下数据表示每月的桌面端和移动端用户数量。

<div class="shadcn-doc-callout">

**注意：** 数据可以采用任意结构。通过 `dataKey` 属性可将数据映射到图表，下方的数据结构仅供参考。

</div>

```tsx:line-numbers [components/example-chart.tsx]
const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]
```

**2. 定义图表配置**

图表配置保存图表的设定。可在其中放置供人阅读的文字（例如标签）、图标及主题使用的颜色 token。

```tsx:line-numbers [components/example-chart.tsx]
import { type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
```

**3. 构建图表**

现在可以使用 Recharts 组件构建图表了。

<div class="shadcn-doc-callout">

**重要：** 请在 `ChartContainer` 组件上设置 `min-h-[VALUE]`，以便图表能响应尺寸变化。

</div>

<demo react="shadcn-base/chart-example.tsx" />

### 添加网格 {#add-a-grid}

为图表添加网格。

**1. 导入 `CartesianGrid` 组件。**

```tsx
import { Bar, BarChart, CartesianGrid } from "recharts"
```

**2. 将 `CartesianGrid` 组件添加到图表。**

```tsx:line-numbers{3}
<ChartContainer config={chartConfig} className="min-h-[200px] w-full">
  <BarChart accessibilityLayer data={chartData}>
    <CartesianGrid vertical={false} />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
  </BarChart>
</ChartContainer>
```

<demo react="shadcn-base/chart-example-grid.tsx" />

### 添加坐标轴 {#add-an-axis}

我们将用 `XAxis` 组件为图表添加 x 轴。

**1. 导入 `XAxis` 组件。**

```tsx
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
```

**2. 将 `XAxis` 组件添加到图表。**

```tsx:line-numbers{4-10}
<ChartContainer config={chartConfig} className="h-[200px] w-full">
  <BarChart accessibilityLayer data={chartData}>
    <CartesianGrid vertical={false} />
    <XAxis
      dataKey="month"
      tickLine={false}
      tickMargin={10}
      axisLine={false}
      tickFormatter={(value) => value.slice(0, 3)}
    />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
  </BarChart>
</ChartContainer>
```

<demo react="shadcn-base/chart-example-axis.tsx" />

### 添加工具提示 {#add-tooltip}

到目前为止，我们一直在使用 Recharts 自带的组件。`chart` 组件内置的样式调整，让它们开箱即有美观的样式。

要添加工具提示，我们将使用 `chart` 提供的自定义 `ChartTooltip` 和 `ChartTooltipContent` 组件。

**1. 导入 `ChartTooltip` 和 `ChartTooltipContent` 组件。**

```tsx
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
```

**2. 将这些组件添加到图表。**

```tsx:line-numbers{11}
<ChartContainer config={chartConfig} className="h-[200px] w-full">
  <BarChart accessibilityLayer data={chartData}>
    <CartesianGrid vertical={false} />
    <XAxis
      dataKey="month"
      tickLine={false}
      tickMargin={10}
      axisLine={false}
      tickFormatter={(value) => value.slice(0, 3)}
    />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
  </BarChart>
</ChartContainer>
```

<demo react="shadcn-base/chart-example-tooltip.tsx" />

将光标悬停在图表上即可看到工具提示。很简单吧？两个组件就能做出美观的工具提示。

### 添加图例 {#add-legend}

图例也采用同样的做法。我们将使用 `chart` 中的 `ChartLegend` 和 `ChartLegendContent` 组件。

**1. 导入 `ChartLegend` 和 `ChartLegendContent` 组件。**

```tsx
import { ChartLegend, ChartLegendContent } from "@/components/ui/chart"
```

**2. 将这些组件添加到图表。**

```tsx:line-numbers{12}
<ChartContainer config={chartConfig} className="h-[200px] w-full">
  <BarChart accessibilityLayer data={chartData}>
    <CartesianGrid vertical={false} />
    <XAxis
      dataKey="month"
      tickLine={false}
      tickMargin={10}
      axisLine={false}
      tickFormatter={(value) => value.slice(0, 3)}
    />
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend content={<ChartLegendContent />} />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
  </BarChart>
</ChartContainer>
```

<demo react="shadcn-base/chart-example-legend.tsx" />

完成了。你已经构建了第一个图表！接下来可以了解什么？

- [主题和颜色](https://ui.shadcn.com/docs/components/chart#theming)
- [工具提示](https://ui.shadcn.com/docs/components/chart#tooltip)
- [图例](https://ui.shadcn.com/docs/components/chart#legend)

## 图表配置 {#chart-config}

在图表配置中定义图表的标签、图标和颜色。

图表配置与图表数据彼此独立。

这样可以在图表之间共享配置和颜色 token。即使数据或颜色 token 保存在远端，或采用不同格式，配置也能独立使用。

```tsx:line-numbers
import { Monitor } from "lucide-react"

import { type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    // Use color: "var(--chart-1)" for both modes, or specify each mode.
    theme: {
      light: "var(--chart-1)",
      dark: "var(--chart-5)",
    },
  },
} satisfies ChartConfig
```

## 主题 {#theming}

图表内置主题支持。可以使用 CSS 变量（推荐），也可以使用十六进制、hsl 或 oklch 等任意格式的颜色值。

### CSS 变量 {#css-variables}

**1. 在 CSS 文件中定义颜色**

```css:line-numbers [app/globals.css]
@layer base {
  :root {
    --chart-1: oklch(0.6007 0.1903 257.9419);
    --chart-2: oklch(0.6369 0.1247 171.0112);
  }

  .dark {
    --chart-1: oklch(0.6496 0.1885 257.7207);
    --chart-2: oklch(0.6943 0.1346 171.9868);
  }
}
```

**2. 将颜色添加到 `chartConfig`**

```tsx:line-numbers [components/example-chart.tsx]
const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
```

### 直接传入主题色值 {#hex-hsl-or-oklch}

需要直接传入色值时，可以使用主题中已有的颜色。

```tsx:line-numbers [components/example-chart.tsx]
const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "oklch(0.6369 0.1247 171.0112)",
  },
  tablet: {
    label: "Tablet",
    color: "oklch(0.5495 0.2003 300.1164)",
  },
  laptop: {
    label: "Laptop",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
```

### 使用颜色 {#using-colors}

要在图表中使用主题颜色，请通过 `var(--color-KEY)` 格式引用。

#### 组件 {#components}

```tsx
<Bar dataKey="desktop" fill="var(--color-desktop)" />
```

#### 图表数据 {#chart-data}

```tsx:line-numbers [components/example-chart.tsx]
const chartData = [
  { browser: "chrome", visitors: 275, fill: "var(--color-chrome)" },
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
]
```

#### Tailwind {#tailwind}

```tsx [components/example-chart.tsx]
<LabelList className="fill-(--color-desktop)" />
```

## 工具提示 {#tooltip}

图表工具提示包含标签、名称、指示符和值。可以组合使用这些元素，自定义工具提示。

<demo react="shadcn-base/chart-tooltip.tsx" />

使用 `hideLabel`、`hideIndicator` 属性可以显示或隐藏对应元素，并通过 `indicator` 属性自定义指示符样式。

使用 `labelKey` 和 `nameKey` 为工具提示的标签和名称指定自定义键。

Chart 提供 `<ChartTooltip>` 和 `<ChartTooltipContent>` 组件，可使用这两个组件为图表添加自定义工具提示。

```tsx [components/example-chart.tsx]
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
```

```tsx [components/example-chart.tsx]
<ChartTooltip content={<ChartTooltipContent />} />
```

### 属性 {#props}

使用以下属性自定义工具提示。

| 属性            | 类型                     | 说明                                  |
| :-------------- | :----------------------- | :------------------------------------------- |
| `labelKey` | string | 用于标签的配置键或数据键。 |
| `nameKey` | string | 用于名称的配置键或数据键。 |
| `indicator` | `dot` `line` 或 `dashed` | 工具提示的指示符样式。 |
| `hideLabel` | boolean | 是否隐藏标签。 |
| `hideIndicator` | boolean | 是否隐藏指示符。 |

### 颜色 {#colors}

颜色自动取自图表配置。

### 自定义 {#custom}

使用 `labelKey` 和 `nameKey` 属性为工具提示的标签和名称指定自定义键。

```tsx:line-numbers
const chartData = [
  { browser: "chrome", visitors: 187, fill: "var(--color-chrome)" },
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
]

const chartConfig = {
  visitors: {
    label: "Total Visitors",
  },
  chrome: {
    label: "Chrome",
    color: "var(--chart-1)",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
```

```tsx [components/example-chart.tsx]
<ChartTooltip
  content={<ChartTooltipContent labelKey="visitors" nameKey="browser" />}
/>
```

这会将 `Total Visitors` 用作标签，将 `Chrome` 和 `Safari` 用作工具提示的名称。

## 图例 {#legend}

可以使用自定义的 `<ChartLegend>` 和 `<ChartLegendContent>` 组件为图表添加图例。

```tsx [components/example-chart.tsx]
import { ChartLegend, ChartLegendContent } from "@/components/ui/chart"
```

```tsx [components/example-chart.tsx]
<ChartLegend content={<ChartLegendContent />} />
```

### 颜色 {#colors-1}

颜色自动取自图表配置。

### 自定义 {#custom-1}

使用 `nameKey` 属性为图例名称指定自定义键。

```tsx:line-numbers
const chartData = [
  { browser: "chrome", visitors: 187, fill: "var(--color-chrome)" },
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
]

const chartConfig = {
  chrome: {
    label: "Chrome",
    color: "var(--chart-1)",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
```

```tsx [components/example-chart.tsx]
<ChartLegend content={<ChartLegendContent nameKey="browser" />} />
```

这会将 `Chrome` 和 `Safari` 用作图例名称。

## 无障碍 {#accessibility}

可以开启 `accessibilityLayer` 属性，为图表添加无障碍层。

此属性为图表添加键盘访问和屏幕阅读器支持。

```tsx [components/example-chart.tsx]
<LineChart accessibilityLayer />
```

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/chart-rtl.tsx" />
