---
title: Diagram（示意图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Diagram（示意图）

为图形提供缩放、重置和展开操作。

图是其他人已经渲染的图形的镶边：标题、缩放百分比和缩放控件围绕你作为 `children` 传递的任何内容。使用运行时，你可以将任何工具呈现的内容交给它。在独立版中，你自己拥有缩放级别和图形。

<demo react="assistant-ui/diagram-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-diagram"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-diagram.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

通过运行时，`Diagram` 可以呈现工具已转换为图形的任何内容：图像 URL、图表库的输出或来自 Mermaid 等渲染器的标记。它只拥有变焦预览外框。缩放级别本身与调用者保持一致，因为每个缩放回调都是可选的，并且当前的 `zoom` 是一个普通的 prop。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { Diagram } from "@/components/assistant-ui/elements/diagram";

type RenderDiagramResult = { title: string; imageUrl: string };

export const RenderDiagramToolUI: ToolCallMessagePartComponent<
  { prompt: string },
  RenderDiagramResult
> = ({ result }) => {
  const [zoom, setZoom] = useState(1);
  if (!result) return null;

  return (
    <Diagram
      title={result.title}
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(2, z + 0.2))}
      onZoomOut={() => setZoom((z) => Math.max(0.4, z - 0.2))}
      onReset={() => setZoom(1)}
    >
      <img src={result.imageUrl} alt={result.title} className="max-w-none" />
    </Diagram>
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { RenderDiagramToolUI } from "@/components/assistant-ui/elements/render-diagram-tool-ui";

export const toolkit = defineToolkit({
  render_diagram: {
    type: "frontend",
    description: "根据文本描述呈现带标签的图表。",
    parameters: z.object({ prompt: z.string() }),
    execute: async ({ prompt }) => renderDiagramImage(prompt),
    render: RenderDiagramToolUI,
  },
});
```

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

   请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)，了解后端定义的工具和授权请求。

**独立版**

独立版中，`Diagram` 永远不会接触 `zoom` 本身：将其保持在状态并自己夹紧它，就像下面的处理程序一样。

### 维护缩放比例 {#hold-the-zoom-level}

```tsx
"use client";

import { useState } from "react";
import { Diagram } from "@/components/assistant-ui/elements/diagram";
import { FlowSvg } from "./flow-svg";

export function MessageFlow() {
  const [zoom, setZoom] = useState(1);

  return (
    <Diagram
      title="消息流"
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(1.6, z + 0.2))}
      onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.2))}
      onReset={() => setZoom(1)}
    >
      <FlowSvg />
    </Diagram>
  );
}
```

### 打开全尺寸视图 {#open-a-full-bleed-view}

   除非你传递 `onExpand`，否则展开按钮将被禁用，因此一旦有可扩展视图的位置（例如对话框），就将其连接起来。

```tsx
const [open, setOpen] = useState(false);

<Diagram title="消息流" zoom={zoom} onExpand={() => setOpen(true)} /* ... */>
  <FlowSvg />
</Diagram>;
```

## 结构 {#anatomy}

```tsx
<div data-slot="diagram">
  <div>{/* title, zoom percentage, zoom-out / zoom-in / reset / expand buttons */}</div>
  <div>{/* children, scaled by `zoom` via a CSS transform */}</div>
</div>
```

展开按钮是唯一处于禁用状态的按钮：它会呈现 `disabled`，并在省略 `onExpand` 时变暗，因为它无处可去。其他三个按钮没有禁用状态，并且 `Diagram` 不会限制 `zoom` 本身，因此超出范围的值是调用者传入的值。百分比标签将 `zoom` 舍入到最接近的整数。

## 示例 {#examples}

### 调整框架 {#restyle-the-frame}

两种用法都支持通过 `className` 调整根元素。标题按钮读取共享的 `ghostButton` 标记，百分比读取 `mono`，两者都来自 `surfaces.tsx`。

```tsx
<Diagram className="max-w-none" /* ... */ />
```

### 限制缩放范围 {#clamping-the-zoom-range}

`Diagram` 报告按钮按下情况，但永远不会自行绑定 `zoom`，因此将其夹在更改它的相同处理程序中：

```tsx
const clamp = (z: number) => Math.min(2, Math.max(0.4, z));

<Diagram
  zoom={zoom}
  onZoomIn={() => setZoom((z) => clamp(z + 0.2))}
  onZoomOut={() => setZoom((z) => clamp(z - 0.2))}
  /* ... */
/>;
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### Diagram {#diagram}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ----------------- | -------- | -------------------------------------------------------------------------------- |
| `title` | `string` |  | 显示在标题左侧。 |
| `zoom` | `number` |  | 使用 CSS `transform` 应用于 `children` 的缩放。未被元件夹紧。 |
| `children` | `React.ReactNode` |  | 渲染的图形。 |
| `onZoomIn` | `() => void` |  | 按下放大按钮时调用。 |
| `onZoomOut` | `() => void` |  | 按下缩小按钮时调用。 |
| `onReset` | `() => void` |  | 按下复位按钮时调用。 |
| `onExpand` | `() => void` |  | 按下全屏按钮时调用。省略它会禁用该按钮。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
