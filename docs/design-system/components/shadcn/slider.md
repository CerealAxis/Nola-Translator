---
title: Slider（滑块）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Slider（滑块）

用于在给定范围内选取数值的输入控件。

<demo react="shadcn-base/slider-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add slider
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/slider.tsx [components/ui/slider.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Slider } from "@/components/ui/slider"
```

```tsx
<Slider defaultValue={[33]} max={100} step={1} />
```

## 范围 {#range}

使用包含两个值的数组创建范围滑块。

<demo react="shadcn-base/slider-range.tsx" />

## 多个滑柄 {#multiple-thumbs}

使用包含多个值的数组创建多个滑柄。

<demo react="shadcn-base/slider-multiple.tsx" />

## 垂直 {#vertical}

使用 `orientation="vertical"` 创建垂直滑块。

<demo react="shadcn-base/slider-vertical.tsx" />

## 受控 {#controlled}

<demo react="shadcn-base/slider-controlled.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁用滑块。

<demo react="shadcn-base/slider-disabled.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/slider-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Slider](https://base-ui.com/react/components/slider#api-reference) 文档。
