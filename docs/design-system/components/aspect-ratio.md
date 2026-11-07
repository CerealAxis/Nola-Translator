---
title: Aspect Ratio（宽高比）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Aspect Ratio（宽高比）

按指定的宽高比显示内容。

<demo react="shadcn-base/aspect-ratio-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add aspect-ratio
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/aspect-ratio.tsx [components/ui/aspect-ratio.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { AspectRatio } from "@/components/ui/aspect-ratio"
```

```tsx:line-numbers
<AspectRatio ratio={16 / 9}>
  <Image src="..." alt="Image" className="rounded-md object-cover" />
</AspectRatio>
```

## 正方形 {#square}

使用 `ratio={1 / 1}` 属性设置正方形宽高比，适合以正方形格式展示图像。

<demo react="shadcn-base/aspect-ratio-square.tsx" />

## 纵向 {#portrait}

使用 `ratio={9 / 16}` 属性设置纵向宽高比，适合以纵向格式展示图像。

<demo react="shadcn-base/aspect-ratio-portrait.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/aspect-ratio-rtl.tsx" />

## API 参考 {#api-reference}

### AspectRatio {#aspectratio}

`AspectRatio` 组件按指定的宽高比显示内容。

| 属性        | 类型     | 默认值 | 必填 |
| ----------- | -------- | ------- | -------- |
| `ratio`     | `number` | -       | 是       |
| `className` | `string` | -       | 否       |

更多信息请参阅 [Base UI documentation](https://base-ui.com/react/components/aspect-ratio#api-reference)。
