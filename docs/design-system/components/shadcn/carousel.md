---
title: Carousel（轮播）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Carousel（轮播）

基于 Embla 构建，带动效和滑动手势的轮播。

<demo react="shadcn-base/carousel-demo.tsx" />

## 简介 {#about}

轮播组件基于 [Embla Carousel](https://www.embla-carousel.com/) 库构建。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add carousel
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install embla-carousel-react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/carousel.tsx [components/ui/carousel.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
```

```tsx:line-numbers
<Carousel>
  <CarouselContent>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

## 结构 {#composition}

按以下结构组合 `Carousel`：

```text
Carousel
├── CarouselContent
│   ├── CarouselItem
│   └── CarouselItem
├── CarouselPrevious
└── CarouselNext
```

## 尺寸 {#sizes}

可以使用 `<CarouselItem />` 上的 `basis` 工具类设置条目尺寸。

<demo react="shadcn-base/carousel-size.tsx" />

```tsx:line-numbers{4-6}
// 33% of the carousel width.
<Carousel>
  <CarouselContent>
    <CarouselItem className="basis-1/3">...</CarouselItem>
    <CarouselItem className="basis-1/3">...</CarouselItem>
    <CarouselItem className="basis-1/3">...</CarouselItem>
  </CarouselContent>
</Carousel>
```

```tsx:line-numbers{4-6}
// 50% on small screens and 33% on larger screens.
<Carousel>
  <CarouselContent>
    <CarouselItem className="md:basis-1/2 lg:basis-1/3">...</CarouselItem>
    <CarouselItem className="md:basis-1/2 lg:basis-1/3">...</CarouselItem>
    <CarouselItem className="md:basis-1/2 lg:basis-1/3">...</CarouselItem>
  </CarouselContent>
</Carousel>
```

## 间距 {#spacing}

要设置条目之间的间距，可以在 `<CarouselItem />` 上使用 `pl-[VALUE]` 工具类，并在 `<CarouselContent />` 上使用负值类 `-ml-[VALUE]`。

<demo react="shadcn-base/carousel-spacing.tsx" />

```tsx:line-numbers
<Carousel>
  <CarouselContent className="-ml-4">
    <CarouselItem className="pl-4">...</CarouselItem>
    <CarouselItem className="pl-4">...</CarouselItem>
    <CarouselItem className="pl-4">...</CarouselItem>
  </CarouselContent>
</Carousel>
```

```tsx:line-numbers
<Carousel>
  <CarouselContent className="-ml-2 md:-ml-4">
    <CarouselItem className="pl-2 md:pl-4">...</CarouselItem>
    <CarouselItem className="pl-2 md:pl-4">...</CarouselItem>
    <CarouselItem className="pl-2 md:pl-4">...</CarouselItem>
  </CarouselContent>
</Carousel>
```

## 排列方向 {#orientation}

使用 `orientation` 属性设置轮播的排列方向。

<demo react="shadcn-base/carousel-orientation.tsx" />

```tsx:line-numbers
<Carousel orientation="vertical | horizontal">
  <CarouselContent>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
  </CarouselContent>
</Carousel>
```

## 选项 {#options}

可以通过 `opts` 属性向轮播传递选项。更多信息请参阅 [Embla Carousel 文档](https://www.embla-carousel.com/api/options/)。

```tsx:line-numbers{2-5}
<Carousel
  opts={{
    align: "start",
    loop: true,
  }}
>
  <CarouselContent>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
  </CarouselContent>
</Carousel>
```

## API {#api}

使用一个状态变量和 `setApi` 属性获取轮播 API 的实例。

<demo react="shadcn-base/carousel-api.tsx" />

```tsx:line-numbers{1,4,22}
import { type CarouselApi } from "@/components/ui/carousel"

export function Example() {
  const [api, setApi] = React.useState<CarouselApi>()
  const [current, setCurrent] = React.useState(0)
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    if (!api) {
      return
    }

    setCount(api.scrollSnapList().length)
    setCurrent(api.selectedScrollSnap() + 1)

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1)
    })
  }, [api])

  return (
    <Carousel setApi={setApi}>
      <CarouselContent>
        <CarouselItem>...</CarouselItem>
        <CarouselItem>...</CarouselItem>
        <CarouselItem>...</CarouselItem>
      </CarouselContent>
    </Carousel>
  )
}
```

## 事件 {#events}

可以通过 `setApi` 提供的 API 实例监听事件。

```tsx:line-numbers{1,4-14,16}
import { type CarouselApi } from "@/components/ui/carousel"

export function Example() {
  const [api, setApi] = React.useState<CarouselApi>()

  React.useEffect(() => {
    if (!api) {
      return
    }

    api.on("select", () => {
      // Do something on select.
    })
  }, [api])

  return (
    <Carousel setApi={setApi}>
      <CarouselContent>
        <CarouselItem>...</CarouselItem>
        <CarouselItem>...</CarouselItem>
        <CarouselItem>...</CarouselItem>
      </CarouselContent>
    </Carousel>
  )
}
```

有关事件用法的更多信息，请参阅 [Embla Carousel 文档](https://www.embla-carousel.com/api/events/)。

## 插件 {#plugins}

可以使用 `plugins` 属性为轮播添加插件。

```ts:line-numbers{1,6-10}
import Autoplay from "embla-carousel-autoplay"

export function Example() {
  return (
    <Carousel
      plugins={[
        Autoplay({
          delay: 2000,
        }),
      ]}
    >
      // ...
    </Carousel>
  )
}
```

<demo react="shadcn-base/carousel-plugin.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/carousel-rtl.tsx" />

为 RTL 语言本地化轮播时，需要让 `opts` 属性中的 `direction` 选项与文字方向一致，以确保轮播向正确的方向滚动。

```tsx:line-numbers{2-5}
<Carousel
  dir={dir}
  opts={{
    direction: dir,
  }}
>
  <CarouselContent>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
    <CarouselItem>...</CarouselItem>
  </CarouselContent>
  <CarouselPrevious className="rtl:rotate-180" />
  <CarouselNext className="rtl:rotate-180" />
</Carousel>
```

`direction` 选项接受 `"ltr"` 或 `"rtl"`，并应与 `dir` 属性的值一致。也可以通过 `rtl:rotate-180` 类旋转导航按钮，使其指向正确的方向。

## API 参考 {#api-reference}

有关属性和插件的更多信息，请参阅 [Embla Carousel 文档](https://www.embla-carousel.com/api/)。
