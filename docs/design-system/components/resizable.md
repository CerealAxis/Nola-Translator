---
title: Resizable（可调整大小）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Resizable（可调整大小）

支持键盘操作且具备无障碍性的可调整尺寸面板组及布局。

<demo react="shadcn-base/resizable-demo.tsx" />

## 关于 {#about}

`Resizable` 组件基于 [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)，该库由 [bvaughn](https://github.com/bvaughn) 开发。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add resizable
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install react-resizable-panels
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/resizable.tsx [components/ui/resizable.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
```

```tsx:line-numbers
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel>One</ResizablePanel>
  <ResizableHandle />
  <ResizablePanel>Two</ResizablePanel>
</ResizablePanelGroup>
```

## 组件结构 {#composition}

使用以下结构构建 `ResizablePanelGroup`：

```text
ResizablePanelGroup
├── ResizablePanel
├── ResizableHandle
└── ResizablePanel
```

## 垂直 {#vertical}

使用 `orientation="vertical"` 沿垂直方向调整尺寸。

<demo react="shadcn-base/resizable-vertical.tsx" />

## 手柄 {#handle}

在 `ResizableHandle` 上设置 `withHandle` 属性以显示手柄。

<demo react="shadcn-base/resizable-handle.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/resizable-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels/tree/main/packages/react-resizable-panels) 文档。

## 更新日志 {#changelog}

### 2025-02-02 `react-resizable-panels` v4 {#2025-02-02-react-resizable-panels-v4}

已更新到 `react-resizable-panels` v4。详情请参阅 [v4.0.0 发布说明](https://github.com/bvaughn/react-resizable-panels/releases/tag/4.0.0)。

如果直接使用 `react-resizable-panels` 的基础组件，请留意以下变更：

| v3                           | v4                      |
| ---------------------------- | ----------------------- |
| `PanelGroup`                 | `Group`                 |
| `PanelResizeHandle`          | `Separator`             |
| `direction` 属性 | `orientation` 属性 |
| `defaultSize={50}`           | `defaultSize="50%"`     |
| `onLayout`                   | `onLayoutChange`        |
| `ImperativePanelHandle`      | `PanelImperativeHandle` |
| Panel 上的 `ref` 属性 | `panelRef` 属性 |
| `data-panel-group-direction` | `aria-orientation`      |

<div class="shadcn-doc-callout">

  shadcn/ui 的封装组件（`ResizablePanelGroup`、`ResizablePanel`、
  `ResizableHandle`）保持不变。

</div>
