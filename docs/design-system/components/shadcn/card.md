---
title: Card（卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Card（卡片）

显示带页头、内容和页脚的卡片。

<demo react="shadcn-base/card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add card
```

</template>

<template #manual>

**1. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/card.tsx [components/ui/card.tsx]

**2. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
```

```tsx:line-numbers
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card Description</CardDescription>
    <CardAction>Card Action</CardAction>
  </CardHeader>
  <CardContent>
    <p>Card Content</p>
  </CardContent>
  <CardFooter>
    <p>Card Footer</p>
  </CardFooter>
</Card>
```

## 结构 {#composition}

按以下结构组合 `Card`：

```text
Card
├── CardHeader
│   ├── CardTitle
│   ├── CardDescription
│   └── CardAction
├── CardContent
└── CardFooter
```

## 尺寸 {#size}

使用 `size="sm"` 属性将卡片设为小尺寸。小尺寸变体的间距更小。

<demo react="shadcn-base/card-small.tsx" />

## 间距 {#spacing}

除了 `size` 属性，还可以使用 CSS 变量 `--card-spacing` 控制各区块之间的间距及卡片各部分的内缩距离。

<demo react="shadcn-base/card-spacing.tsx" />

使用 `-mx-(--card-spacing)` 设置负外边距，让内容延伸到卡片边缘，并保持与卡片内缩区域的对齐关系。贴边内容位于页脚上方时，在 `CardContent` 上使用 `-mb-(--card-spacing)` 可去掉区块间距。

<demo react="shadcn-base/card-edge-to-edge.tsx" />

## 图像 {#image}

在卡片页头前添加图像，即可创建带图像的卡片。

<demo react="shadcn-base/card-image.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/card-rtl.tsx" />

## API 参考 {#api-reference}

### Card {#card}

`Card` 组件是卡片内容的根容器。

| 属性        | 类型                | 默认值     |
| ----------- | ------------------- | ----------- |
| `size`      | `"default" \| "sm"` | `"default"` |
| `className` | `string`            | -           |

### CardHeader {#cardheader}

`CardHeader` 组件用于显示标题、说明和可选操作。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### CardTitle {#cardtitle}

`CardTitle` 组件用于显示卡片标题。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### CardDescription {#carddescription}

`CardDescription` 组件用于显示标题下方的辅助文字。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### CardAction {#cardaction}

`CardAction` 组件将内容放在页头右上角，例如按钮或徽章。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### CardContent {#cardcontent}

`CardContent` 组件用于显示卡片主体。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### CardFooter {#cardfooter}

`CardFooter` 组件用于显示卡片底部的操作和次要内容。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

## 更新日志 {#changelog}

### 间距变量 {#spacing-variable}

如果你从旧版 `Card` 组件升级，需要应用以下更新才能使用 `--card-spacing` 变量：

**1. 更新 Card 根元素的间距类。**

使用 `--card-spacing` 替换硬编码的间距和纵向内边距，并在根元素上设置默认尺寸和小尺寸的值：

```diff
  className={cn(
-   "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
+   "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
    className
  )}
```

**2. 更新 CardHeader 的间距类。**

使用共享变量替换横向内边距和边框间距：

```diff
  className={cn(
-   "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
+   "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
    className
  )}
```

**3. 更新 CardContent 和 CardFooter 的间距类。**

使用 `--card-spacing` 设置内容的内缩距离和页脚内边距：

```diff
  function CardContent({ className, ...props }: React.ComponentProps<"div">) {
    return (
      <div
        data-slot="card-content"
-       className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
+       className={cn("px-(--card-spacing)", className)}
        {...props}
      />
    )
  }
```

```diff
  className={cn(
-   "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
+   "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
    className
  )}
```

应用这些更改后，可以在 `Card` 上使用任意属性类设置 `--card-spacing`，自定义卡片间距：

```tsx
function Example() {
  return <Card className="[--card-spacing:--spacing(6)]">...</Card>
}
```
