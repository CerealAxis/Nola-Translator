---
title: Marker（标记）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Marker（标记）

在会话中显示行内状态、系统提示、带边框的行或带标签的分隔线。

<demo react="shadcn-base/marker-demo.tsx" />

`Marker` 组件显示行内会话标记，例如状态更新、系统提示、带边框的行以及带标签的分隔线。在会话中可搭配 [`Message`](https://ui.shadcn.com/docs/components/message) 使用。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add marker
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/marker.tsx [components/ui/marker.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
```

```tsx:line-numbers
<Marker>
  <MarkerIcon>
    <CheckIcon />
  </MarkerIcon>
  <MarkerContent>Explored 4 files</MarkerContent>
</Marker>
```

## 组件结构 {#composition}

使用以下结构构建标记：

```text
Marker
├── MarkerIcon
└── MarkerContent
```

## 特性 {#features}

- 支持行内标记、带边框的行和带标签的分隔线变体
- 提供对辅助技术隐藏的装饰图标插槽
- 通过 `render` 替换根元素，支持链接或按钮形式的标记
- 搭配 [`shimmer`](https://ui.shadcn.com/docs/utils/shimmer) 工具类，为流式状态文本添加动效
- 每个部分都可以通过 `className` 属性自定义样式

## 变体 {#variants}

使用 `variant` 在行内标记、带边框的行和带标签的分隔线之间切换。

<demo react="shadcn-base/marker-variants.tsx" />

| 变体 | 说明 |
| ----------- | ---------------------------------------------------- |
| `default` | 用于状态、提示和操作的行内标记。 |
| `border` | 在行底部带边框的默认标记。 |
| `separator` | 标签居中，两侧各有一条分隔线。 |

## 状态 {#status}

对于流式或进行中的标记，设置 `role="status"` 并加入 [`Spinner`](https://ui.shadcn.com/docs/components/spinner)，使辅助技术播报更新。

<demo react="shadcn-base/marker-status.tsx" />

## 微光效果 {#shimmer}

为 `MarkerContent` 添加 [`shimmer`](https://ui.shadcn.com/docs/utils/shimmer) 工具类，为流式文本添加动效。此工具类由 `shadcn` 包提供，安装方式请参阅 shimmer 文档。

<demo react="shadcn-base/marker-shimmer.tsx" />

## 分隔线 {#separator}

使用 `separator` 变体在会话中显示带标签的分隔线，例如日期或章节分隔。[Checkpoint](https://ui.shadcn.com/docs/ai-elements/base/checkpoint) 是带按钮的分隔线，按钮可将会话恢复到该位置。

<demo react="shadcn-base/marker-separator.tsx" />

## 边框 {#border}

对于要保留默认标记对齐方式，同时与下一行分隔的状态行，请使用 `border` 变体。

<demo react="shadcn-base/marker-border.tsx" />

## 带图标 {#with-icon}

使用 `MarkerIcon` 在内容旁渲染图标。使用 `flex-col` 将图标排列到内容上方。

<demo react="shadcn-base/marker-icon.tsx" />

## 链接和按钮 {#links-and-buttons}

使用 `Marker` 的 `render` 属性将标记变为链接或按钮。

<demo react="shadcn-base/marker-link-button.tsx" />

```tsx:line-numbers
import { Marker, MarkerContent } from "@/components/ui/marker"

export function MarkerLinkDemo() {
  return (
    <Marker render={<a href="#" />}>
      <MarkerContent>View the pull request</MarkerContent>
    </Marker>
  )
}
```

## 无障碍 {#accessibility}

`Marker` 默认仅用于呈现。合适的语义取决于实际用途，请按用途选择角色。

### 状态与进度 {#status-and-progress}

对于「正在思考…」或正在运行的工具等流式或进度标记，请设置 `role="status"`，使辅助技术在更新出现时播报。`Marker` 会将 `role` 转发给底层元素。

```tsx:line-numbers
<Marker role="status">
  <MarkerIcon>
    <Spinner />
  </MarkerIcon>
  <MarkerContent>Compacting conversation</MarkerContent>
</Marker>
```

### 带标签的分隔线 {#labeled-separators}

带日期或章节标签等文本的分隔线无需设置角色。分隔线由装饰性的 CSS 伪元素绘制，文本按普通内容播报。

```tsx:line-numbers
<Marker variant="separator">
  <MarkerContent>Today</MarkerContent>
</Marker>
```

<div class="shadcn-doc-callout">

  **注意：** 请勿为带标签的分隔线添加 `role="separator"`。该角色
  从 `aria-label` 获取无障碍名称，不读取内部文本，并将
  内容视为装饰，因此不会播报可见标签。
  请仅对没有有意义文本的分隔线使用 `role="separator"`。

</div>

### 带边框的标记 {#bordered-markers}

带边框标记的语义与默认标记相同。底边框仅用于装饰，请根据标记的用途选择设置 `role="status"`、`render` 或不设置角色。

```tsx:line-numbers
<Marker variant="border">
  <MarkerIcon>
    <FileTextIcon />
  </MarkerIcon>
  <MarkerContent>Opened implementation notes</MarkerContent>
</Marker>
```

### 装饰图标 {#decorative-icons}

`MarkerIcon` 是装饰性的，通过 `aria-hidden` 对辅助技术隐藏，含义由相邻的 `MarkerContent` 表达。对于仅含图标的标记，请提供 `aria-label` 或可见文本，以免被播报为空。

```tsx:line-numbers
<Marker aria-label="Synced">
  <MarkerIcon>
    <CheckIcon />
  </MarkerIcon>
</Marker>
```

### 交互标记 {#interactive-markers}

标记用于链接或触发操作时，请用 `render` 属性将其渲染为真正的 `<button>` 或 `<a>`，以便获取焦点并提供正确的角色。无障碍名称来自标记的文本。

```tsx:line-numbers
<Marker render={<a href="/files" />}>
  <MarkerIcon>
    <FileTextIcon />
  </MarkerIcon>
  <MarkerContent>Explored 4 files</MarkerContent>
</Marker>
```

## API 参考 {#api-reference}

### Marker {#marker}

标记的根元素。该文件还导出了 `markerVariants`，便于将标记样式组合到自定义组件中。

| 属性        | 类型                                   | 默认值     | 说明                                      |
| ----------- | -------------------------------------- | ----------- | ------------------------------------------------ |
| `variant` | `"default" \| "border" \| "separator"` | `"default"` | 标记布局。 |
| `render` | `ReactElement \| function` | - | 渲染为其他元素，例如链接。 |
| `className` | `string` | - | 应用于根元素的附加类。 |

### MarkerIcon {#markericon}

装饰图标插槽。通过 `aria-hidden` 对辅助技术隐藏。

| 属性        | 类型     | 默认值 | 说明                                   |
| ----------- | -------- | ------- | --------------------------------------------- |
| `className` | `string` | - | 应用于图标插槽的附加类。 |

### MarkerContent {#markercontent}

标记的文本内容。

| 属性        | 类型     | 默认值 | 说明                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | - | 应用于内容插槽的附加类。 |
