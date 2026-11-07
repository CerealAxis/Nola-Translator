---
title: Image gallery（图片集）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Image gallery（图片集）

用网格展示多张图片，点击后可在同一查看器中浏览。

图像库将工具返回的多个图像（例如搜索结果或生成的变体）分组到紧凑的网格中，而不会使文字记录变得沉重。

<demo react="assistant-ui/image-gallery-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-image-gallery"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-image-gallery.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

后端工具可以将其完成的图像返回为 `{ images }`。它的渲染函数将该结果直接传递给 `ImageGallery`，因此稍后的工具结果会在记录中创建一个单独的图库。

### 渲染工具结果 {#render-the-tool-result}

```tsx
"use client";

import {
  defineToolkit,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  ImageGallery,
  type GalleryImage,
} from "@/components/assistant-ui/elements/image-gallery";

type ImageSearchResult = { images: GalleryImage[] };

const ImageSearchToolUI: ToolCallMessagePartComponent<
  { query: string },
  ImageSearchResult
> = ({ result }) => <ImageGallery images={result?.images ?? []} />;

export const toolkit = defineToolkit({
  show_image_results: {
    type: "backend",
    render: ImageSearchToolUI,
  },
});
```

**独立版**

使用你自己的搜索或生成请求中的图像渲染图库。 `onOpen` 对于轻量级分析或同步附近的详细信息面板非常有用。

```tsx
import { ImageGallery, type GalleryImage } from "@/components/assistant-ui/elements/image-gallery";

const images: GalleryImage[] = [
  {
    id: "redwood",
    src: "/results/redwood.jpg",
    alt: "阳光透过红杉林",
    caption: "生成的景观，变化 1",
  },
];

export function Results() {
  return <ImageGallery images={images} onOpen={(id) => console.log(id)} />;
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="image-gallery">
  <button aria-label="打开图像：阳光透过红杉树林">
    <img loading="lazy" />
  </button>
  <div role="dialog" aria-modal="true">
    <img />
    <div>标题、源、计数器和图像控件</div>
  </div>
</div>
```

网格使用两列，当容器有空间时会增长到三列。默认情况下显示六张图像。当有更多时，最终可见图块将读取 `+N` 并在该图像处打开，而不是隐藏图库的其余部分。该对话框与上一个和下一个控件、ArrowLeft 和 ArrowRight 以及 Escape 保持其位置。它在打开时本身获得焦点，当第一个或最后一个图像禁用另一个图像时将焦点保持在导航控件上，并将焦点返回到打开它的图块。

## 示例 {#examples}

### 显示溢出图块 {#show-an-overflow-tile}

当周围布局需要更小的网格时，设置`maxVisible`。最终可见图块仍按顺序保留下一个图像。

```tsx
<ImageGallery images={images} maxVisible={3} />
```

### 链接图像源 {#link-image-sources}

图像可以带有标题和来源。仅对于安全的 `http`、`https`、`mailto` 或相对 URL，源才成为外部链接。

```tsx
<ImageGallery
  images={[
    {
      id: "river",
      src: "/results/river.jpg",
      alt: "从上方看到的河流",
      caption: "参考照片",
      source: {
        label: "国家公园管理局",
        url: "https://www.nps.gov/",
      },
    },
  ]}
/>
```

## API 参考 {#api-reference}

**运行时版**

### 工具结果 {#tool-result}

| 字段 | 类型 | 说明 |
| ---------------------- | ------------------ | ----------------------------------------------------------------------- |
| `result.images` | `GalleryImage[]` | 后端调用完成后传递到图库的工具结果。 |
| `GalleryImage.id` | `string` | 稳定的图像标识符报告给`onOpen`。 |
| `GalleryImage.src` | `string` | 图像 URL 或数据 URI。 |
| `GalleryImage.alt` | `string` | 可访问的图像描述和图块标签。 |
| `GalleryImage.caption` | `string` | 灯箱标题行中的可选文本。 |
| `GalleryImage.source` | `{ label?, url? }` | 可选源标签，仅在其 URL 安全时链接。 |

**独立版**

### ImageGallery {#imagegallery}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ------------------------- | -------- | ------------------------------------------------------------------- |
| `images` | `readonly GalleryImage[]` |  | 网格和灯箱顺序的图像。空列表不会呈现任何内容。 |
| `maxVisible` | `number` | `6` | 最后一个图块显示剩余计数之前的图块数量。 |
| `onOpen` | `(id: string) => void` |  | 接收打开的图像id。 |
| `className` | `string` |  | 合并到图库根元素。 |

其余 `div` 属性会传给根元素。
