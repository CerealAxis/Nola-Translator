---
title: Web preview（网页预览）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Web preview（网页预览）

提供地址栏、刷新和新窗口入口，用隔离的框架展示网页。

Web 预览是围绕预览的镶边：重新加载按钮、URL 栏和围绕你提供的框架的“在新选项卡中打开”按钮，完全按照给定的方式呈现，没有自己的隔离。在运行时，框架来自于通过沙箱库渲染工具的结果。独立的你直接给它一个已经沙盒化的框架。

<demo react="assistant-ui/web-preview-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-web-preview"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-web-preview.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`WebPreview` 永远不会对其 `children` 本身进行沙箱处理，因此将其与返回模型写入标记的工具配对意味着您自己隔离该标记。 [`safe-content-frame`](https://www.assistant-ui.com/safe-content-frame) 是为此构建的：它在单独的每次渲染源上安装 iframe，因此模型生成的脚本无法访问页面的 cookie、存储或 DOM。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SafeContentFrame, type RenderedFrame } from "safe-content-frame";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { WebPreview } from "@/components/assistant-ui/elements/web-preview";

const frame = new SafeContentFrame("my-app");

export const RenderPreviewToolUI: ToolCallMessagePartComponent<
  Record<string, never>,
  { html: string }
> = ({ result }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<RenderedFrame | undefined>(undefined);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!result || !containerRef.current) return;
    let cancelled = false;
    frame.renderHtml(result.html, containerRef.current).then((rendered) => {
      if (cancelled) return;
      renderedRef.current = rendered;
      setOrigin(new URL(rendered.origin).host);
      rendered.fullyLoadedPromiseWithTimeout(5000).then(() => setLoading(false));
    });
    return () => {
      cancelled = true;
      renderedRef.current?.dispose();
    };
  }, [result]);

  if (!result) return null;

  return (
    <WebPreview
      origin={origin}
      loading={loading}
      onOpenExternal={() => window.open(`https://${origin}`, "_blank", "noopener,noreferrer")}
    >
      <div ref={containerRef} className="h-56" />
    </WebPreview>
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { RenderPreviewToolUI } from "@/components/assistant-ui/elements/render-preview-tool-ui";

export const toolkit = defineToolkit({
  render_preview: {
    type: "frontend",
    description: "将独立的 HTML 文档渲染为实时预览。",
    parameters: z.object({ html: z.string() }),
    execute: async ({ html }) => ({ html }),
    render: RenderPreviewToolUI,
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

   单独安装`safe-content-frame`；它与框架无关，并且没有自己的 React 依赖项。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 了解后端定义的工具和授权请求。

**独立版**

独立版中，`WebPreview` 仅适用于 chrome：构建或重用你自己的沙盒框架并将其作为 `children` 传递。

### 渲染已置于沙盒中的框架 {#render-an-already-sandboxed-frame}

```tsx
"use client";

import { useState } from "react";
import { WebPreview } from "@/components/assistant-ui/elements/web-preview";

export function Preview({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  return (
    <WebPreview
      origin={new URL(url).host}
      loading={loading}
      onReload={() => {
        setLoading(true);
        setKey((k) => k + 1);
      }}
      onOpenExternal={() => window.open(url, "_blank", "noopener,noreferrer")}
    >
      <iframe
        key={key}
        src={url}
        sandbox="allow-scripts allow-same-origin"
        className="h-56 w-full border-0"
        onLoad={() => setLoading(false)}
      />
    </WebPreview>
  );
}
```

### URL 变化时替换框架 {#swap-the-frame-when-the-url-changes}

   每当 `url` 更改时，就将 iframe 重新挂载到新的 `key` 上，就像 `onReload` 所做的那样，因此永远不会留下显示先前地址的陈旧帧。

```tsx
useEffect(() => {
  setLoading(true);
  setKey((k) => k + 1);
}, [url]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="web-preview">
  <div>{/* reload button, origin field, open-in-new-tab button */}</div>
  <div>
    <div>{/* children, faded to invisible while loading */}</div>
    {/* a shimmering "Loading preview" label, centered over the content area, only while loading */}
  </div>
</div>
```

`loading` 将 `children` 与 `invisible` 和 `opacity-0` 隐藏在一起，而不是卸载它，因此已经在飞行中的帧会在后台继续加载，而微光标签会覆盖它。只要 `loading` 为 true，重新加载按钮的图标就会旋转。 `onReload` 和 `onOpenExternal` 都是可选的：按钮无论如何渲染，并且在没有处理程序的情况下是无操作的。

## 示例 {#examples}

### 调整预览外框样式 {#restyle-the-chrome}

两种用法都支持通过 `className` 调整根元素。重新加载和打开新按钮读取共享的 `ghostButton` 标记，原始字段读取 `field`，加载标签读取 `ShimmerLabel`，全部来自 `surfaces.tsx`。

```tsx
<WebPreview className="max-w-none" /* ... */ />
```

### 渲染 HTML 以外的内容 {#rendering-something-other-than-html}

**运行时版**

`SafeContentFrame` 还可以呈现任何 MIME 类型或 PDF 的原始字节。交换渲染调用，工具 UI 中的其他所有内容都保持不变。

```tsx
await frame.renderRaw(result.svg, "image/svg+xml", containerRef.current);
// or
await frame.renderPdf(result.pdfBytes, containerRef.current);
```

### 预览你自己的可信内容 {#previewing-your-own-trusted-content}

**独立版**

`WebPreview` 根本不需要 iframe。当内容已受信任、同源且静态时，请将其作为普通标记传递：

```tsx
<WebPreview origin="your-app.vercel.app/reports/42" loading={false}>
  <img src="/reports/42/screenshot.png" alt="报告预览" className="w-full" />
</WebPreview>
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

### SafeContentFrame {#safecontentframe}

| 会员 | 签名 | 说明 |
| ------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `renderHtml` | `(html: string, container: HTMLElement) => Promise<RenderedFrame>` | 将 HTML 字符串渲染到附加到 `container` 的沙盒 iframe 中。 |
| `renderRaw` | `(content: Uint8Array \| string, mimeType: string, container: HTMLElement) => Promise<RenderedFrame>` | 从字符串或字节呈现任何 MIME 类型。 |
| `renderPdf` | `(content: Uint8Array, container: HTMLElement) => Promise<RenderedFrame>` | 呈现 PDF 文档。 |

`RenderedFrame.origin` 是 iframe 加载的哈希值、每次渲染源。将其主机传递给 `WebPreview` 的 `origin` 属性。 `RenderedFrame.dispose()` 删除 iframe，一旦框架发出加载完成信号，`fullyLoadedPromiseWithTimeout(ms)` 就会解析。

**独立版**

### WebPreview {#webpreview}

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | ----------------- | -------- | ------------------------------------------------------------------------------ |
| `origin` | `string` |  | 显示在地址栏中。 |
| `loading` | `boolean` |  | 旋转重新加载图标并在闪烁标签后面变暗 `children`。 |
| `children` | `React.ReactNode` |  | 预览内容。完全按照给定的方式渲染。该元素未沙箱化。 |
| `onReload` | `() => void` |  | 按下重新加载按钮时调用。 |
| `onOpenExternal` | `() => void` |  | 按下“在新选项卡中打开”按钮时调用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
