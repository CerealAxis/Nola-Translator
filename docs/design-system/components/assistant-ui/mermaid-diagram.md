---
title: Mermaid diagram（Mermaid 图表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Mermaid diagram（Mermaid 图表）

从 Mermaid 代码生成图表，提供流式生成状态和放大预览。

<demo react="assistant-ui/mermaid-diagram-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/mermaid-diagram"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

也可安装通过属性传值的独立组件。

```bash
npx shadcn@latest add "@assistant-ui/elements-mermaid-diagram"
```

## 快速开始 {#getting-started}

把图表注册到 Markdown 的语言覆盖项，也可直接传入 Mermaid 源码。

### 添加到 MarkdownText 的语言覆盖 {#add-it-to-markdown-texts-language-overrides}

为 `mermaid` 围栏指定图表组件，其他语言仍使用各自的渲染器。

```tsx
import { MermaidDiagram } from "@/components/assistant-ui/elements/mermaid-diagram.aui";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={defaultComponents}
      componentsByLanguage={{
        mermaid: { SyntaxHighlighter: MermaidDiagram },
      }}
    />
  );
};
```

### 以受控流式状态渲染图表 {#render-a-diagram-with-a-controlled-streaming-flag}

应用独立传入图表代码时，可用流式属性指示源码仍在追加。

```tsx
import { MermaidDiagram } from "@/components/assistant-ui/elements/mermaid-diagram";

<MermaidDiagram code={code} streaming={isStreaming} />;
```

## 结构 {#anatomy}

外框放置生成结果与放大入口，并在等待解析或发生错误时显示状态。

```tsx
// streaming
<div data-slot="mermaid-skeleton" aria-label="正在渲染图表" />

// parsed
<div data-slot="mermaid-zoom-wrap">
  <div data-slot="mermaid-diagram" />
  <button data-slot="mermaid-zoom-trigger" aria-label="放大图表" />
</div>

// unparseable
<div data-slot="mermaid-fallback">
  <pre>{/* raw mermaid source */}</pre>
  <p>无法渲染图表</p>
</div>
```

## 示例 {#examples}

可以复用已有图表，也可给当前预览框增加布局样式。

### 包裹已渲染的图表 {#wrap-a-diagram-you-already-rendered}

应用已有 SVG 或其他图表元素时，可单独使用 `MermaidZoom` 提供放大交互。

```tsx
import { MermaidZoom } from "@/components/assistant-ui/elements/mermaid-diagram";

<MermaidZoom svg={mySvgString}>
  <div dangerouslySetInnerHTML={{ __html: mySvgString }} />
</MermaidZoom>;
```

### 调整图表框样式 {#restyle-the-frame}

对预览框传入类名，保留图表和放大交互。

```tsx
<MermaidDiagram className="rounded-none" code={code} />
```

## API 参考 {#api-reference}

分别使用运行时消息状态、图表渲染器与预览入口。

### 消息片段状态 {#message-part-state}

在模型生成图表源码时使用片段状态避免把中间代码当作最终结果。

### MermaidDiagram {#mermaiddiagram}

接受 Mermaid 源码与当前生成状态，负责解析和渲染。

### MermaidZoom {#mermaidzoom}

包裹已有图表并提供放大查看。
