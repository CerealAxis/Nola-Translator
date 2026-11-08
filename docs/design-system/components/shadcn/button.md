---
title: Button（按钮）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Button（按钮）

显示按钮或外观类似按钮的组件。

<demo react="shadcn-base/button-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add button
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/button.tsx [components/ui/button.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Button } from "@/components/ui/button"
```

```tsx
<Button variant="outline">Button</Button>
```

## 光标 {#cursor}

Tailwind v4 将按钮组件的光标样式从 `cursor: pointer` [改为](https://tailwindcss.com/docs/upgrade-guide#buttons-use-the-default-cursor) `cursor: default`。

如需保留 `cursor: pointer` 行为，请在 CSS 文件中添加以下代码：

也可以在初始化项目时通过 `npx shadcn@latest init --pointer` 启用它。

```css:line-numbers [globals.css]
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

## 尺寸 {#size}

使用 `size` 属性调整按钮尺寸。

<demo react="shadcn-base/button-size.tsx" />

## 默认 {#default}

<demo react="shadcn-base/button-default.tsx" />

## 描边 {#outline}

<demo react="shadcn-base/button-outline.tsx" />

## 次要 {#secondary}

<demo react="shadcn-base/button-secondary.tsx" />

## 幽灵 {#ghost}

<demo react="shadcn-base/button-ghost.tsx" />

## 危险操作 {#destructive}

<demo react="shadcn-base/button-destructive.tsx" />

## 链接 {#link}

<demo react="shadcn-base/button-link.tsx" />

## 图标 {#icon}

<demo react="shadcn-base/button-icon.tsx" />

## 带图标 {#with-icon}

请为图标添加 `data-icon="inline-start"` 或 `data-icon="inline-end"` 属性，以确保间距正确。

<demo react="shadcn-base/button-with-icon.tsx" />

## 全圆角 {#rounded}

使用 `rounded-full` 类可让按钮变为全圆角。

<demo react="shadcn-base/button-rounded.tsx" />

## 加载指示器 {#spinner}

在按钮内部渲染 `<Spinner />` 组件以显示加载状态。请为加载指示器添加 `data-icon="inline-start"` 或 `data-icon="inline-end"` 属性，以确保间距正确。

<demo react="shadcn-base/button-spinner.tsx" />

## 按钮组 {#button-group}

使用 `ButtonGroup` 组件创建按钮组。更多信息请参阅[按钮组](https://ui.shadcn.com/docs/components/base/button-group)文档。

<demo react="shadcn-base/button-group-demo.tsx" />

## 用作链接 {#as-link}

可以使用 `buttonVariants` 辅助函数为链接应用按钮样式。

**请勿使用 `<Button render={<a />} nativeButton={false} />` 渲染链接。** Base UI 的 `Button` 组件始终应用 `role="button"`，会覆盖 `<a>` 元素的链接语义。请将 `buttonVariants` 用于普通的 `<a>` 标签。

<demo react="shadcn-base/button-render.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/button-rtl.tsx" />

## API 参考 {#api-reference}

### Button {#button}

`Button` 组件包裹 `button` 元素，并提供多种样式和功能。

| 属性      | 类型                                                                                 | 默认值     |
| --------- | ------------------------------------------------------------------------------------ | ----------- |
| `variant` | `"default" \| "outline" \| "ghost" \| "destructive" \| "secondary" \| "link"`        | `"default"` |
| `size`    | `"default" \| "xs" \| "sm" \| "lg" \| "icon" \| "icon-xs" \| "icon-sm" \| "icon-lg"` | `"default"` |
