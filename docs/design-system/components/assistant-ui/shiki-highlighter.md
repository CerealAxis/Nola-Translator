---
title: Shiki highlighter（Shiki 高亮）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Shiki highlighter（Shiki 高亮）

为 Markdown 代码块提供 Shiki 高亮，支持流式代码、固定主题和特定行高亮。

<demo react="assistant-ui/shiki-highlighter-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/shiki-highlighter"
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
npx shadcn@latest add "@assistant-ui/elements-shiki-highlighter"
```

## 快速开始 {#getting-started}

将高亮组件注册到 Markdown，或直接渲染代码并控制流式状态。

### 添加到 MarkdownText 的组件配置 {#add-it-to-markdowntexts-components}

把 Shiki 组件传给 `MarkdownText`，以替换代码块的默认高亮器。

```tsx
import { SyntaxHighlighter } from "./shiki-highlighter.aui";

const defaultComponents = memoizeMarkdownComponents({
  SyntaxHighlighter,
  h1: /* ... */,
  // ...other elements...
});
```

### 用受控流式标志渲染代码 {#render-code-with-a-controlled-streaming-flag}

独立使用时传入代码、语言和流式标志，使持续追加的代码及时显示。

```tsx
import { SyntaxHighlighter } from "@/components/assistant-ui/elements/shiki-highlighter";

<SyntaxHighlighter language="tsx" code={code} streaming={isStreaming} />;
```

## 结构 {#anatomy}

代码保留原文本和行边界，Shiki 返回与语言及主题对应的记号样式。

```tsx
<div className="aui-shiki-base">
  {/* streaming: <pre><code>{code}</code></pre>, unhighlighted */}
  {/* settled: useShikiHighlighter's tokenized output */}
</div>
```

## 示例 {#examples}

可调整主题、流式渲染节奏、语法引擎和行样式。

### 设置固定主题 {#set-a-fixed-theme}

明确传入要使用的 Shiki 主题，适合文档中需要固定代码外观的场合。

```tsx
<SyntaxHighlighter language="tsx" code={code} theme="github-dark-default" />
```

### 调整流式延迟 {#tune-the-streaming-delay}

设置生成期间的渲染间隔，平衡新内容出现的速度与高亮开销。

```tsx
<SyntaxHighlighter language="tsx" code={code} delay={0} />
```

### 选择正则引擎 {#pick-the-regexp-engine}

按部署环境选择可用的 Shiki 正则引擎。

```tsx
<SyntaxHighlighter language="tsx" code={code} engine="oniguruma" />
```

### 高亮指定行 {#highlight-specific-lines}

标出需要读者关注的行，仍保留原代码结构。

```tsx
<SyntaxHighlighter
  code={code}
  highlightLines={[2, 5]}
  language="tsx"
/>
```

### 调整容器样式 {#restyle-the-container}

给高亮器外层传入类名，调整其宽度、布局或边框。

```tsx
<SyntaxHighlighter className="[&_pre]:rounded-none" language="tsx" code={code} />
```

## API 参考 {#api-reference}

运行时版本可从消息上下文读生成状态，独立版本显式接收数据。

### 消息片段状态 {#message-part-state}

代码在消息继续生成时可能不完整，流式标志帮助高亮器选择更新策略。

### SyntaxHighlighter {#syntaxhighlighter}

接收代码、语言、主题与可选的流式、行高亮和样式配置。
