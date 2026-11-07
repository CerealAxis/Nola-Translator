---
title: Toggle Group（切换按钮组）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Toggle Group（切换按钮组）

一组可在开启和关闭之间切换的双态按钮。

<demo react="shadcn-base/toggle-group-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add toggle-group
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/toggle-group.tsx [components/ui/toggle-group.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
```

```tsx
<ToggleGroup type="single">
  <ToggleGroupItem value="a">A</ToggleGroupItem>
  <ToggleGroupItem value="b">B</ToggleGroupItem>
  <ToggleGroupItem value="c">C</ToggleGroupItem>
</ToggleGroup>
```

## 组件结构 {#composition}

使用以下结构构建 `ToggleGroup`：

```text
ToggleGroup
├── ToggleGroupItem
└── ToggleGroupItem
```

## 描边 {#outline}

使用 `variant="outline"` 应用描边样式。

<demo react="shadcn-base/toggle-group-outline.tsx" />

## 尺寸 {#size}

使用 `size` 属性调整切换按钮组的尺寸。

<demo react="shadcn-base/toggle-group-sizes.tsx" />

## 间距 {#spacing}

使用 `spacing` 设置组内切换按钮之间的间距。

<demo react="shadcn-base/toggle-group-spacing.tsx" />

## 垂直 {#vertical}

使用 `orientation="vertical"` 创建垂直的切换按钮组。

<demo react="shadcn-base/toggle-group-vertical.tsx" />

## 禁用 {#disabled}

<demo react="shadcn-base/toggle-group-disabled.tsx" />

## 自定义 {#custom}

自定义切换按钮组示例。

<demo react="shadcn-base/toggle-group-font-weight-selector.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/toggle-group-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Toggle Group](https://base-ui.com/react/components/toggle-group#api-reference) 文档。

## 更新日志 {#changelog}

### 2026-05-17 默认间距 {#2026-05-17-default-spacing}

`spacing` 的默认值由 `0` 改为 `2`，切换按钮组默认在各按钮间留出间距。使用 `spacing={0}` 可让按钮相连。
