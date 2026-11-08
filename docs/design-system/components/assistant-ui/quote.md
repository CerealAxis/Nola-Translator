---
title: Quote（引用）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Quote（引用）

选择消息中的文字，通过浮动工具条引用，并在输入区预览引用内容。

<demo react="assistant-ui/quote-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/quote"
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

## 快速开始 {#getting-started}

先让消息显示已发送的引用，再挂载选择工具条和输入区预览。

### 在消息内显示引用 {#show-the-quote-inside-its-message}

将 `QuoteBlock` 放进消息作用域，通常位于消息正文前。

```tsx
import { QuoteBlock } from "@/components/assistant-ui/elements/quote.aui";
import { MessagePrimitive } from "@assistant-ui/react";

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Quote>
        {(quote) => <QuoteBlock {...quote} />}
      </MessagePrimitive.Quote>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
```

### 添加浮动选择工具条 {#add-the-floating-selection-toolbar}

在对话中挂载 `SelectionToolbar`。选中文字后，它提供引用操作。

```tsx
import { SelectionToolbar } from "@/components/assistant-ui/elements/quote.aui";
import { ThreadPrimitive } from "@assistant-ui/react";

function Thread() {
  return (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Viewport>{/* messages, composer */}</ThreadPrimitive.Viewport>
      <SelectionToolbar />
    </ThreadPrimitive.Root>
  );
}
```

### 在输入区预览引用 {#preview-the-quote-in-the-composer}

将 `ComposerQuotePreview` 放进 `ComposerPrimitive.Root`，让用户能查看或移除正在编写的引用。

```tsx
import { ComposerQuotePreview } from "@/components/assistant-ui/elements/quote.aui";
import { ComposerPrimitive } from "@assistant-ui/react";

function Composer() {
  return (
    <ComposerPrimitive.Root>
      <ComposerQuotePreview />
      <ComposerPrimitive.Input placeholder="发送消息…" />
      <ComposerPrimitive.Send />
    </ComposerPrimitive.Root>
  );
}
```

### 把引用传给模型 {#forward-the-quote-to-the-model}

在 AI SDK 路由里用 `injectQuoteContext` 将引用加入模型输入，再执行流式生成。

```typescript
import { convertToModelMessages, streamText } from "ai";
import { injectQuoteContext } from "@assistant-ui/ai-sdk";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: myModel,
    messages: await convertToModelMessages(injectQuoteContext(messages)),
  });

  return result.toUIMessageStreamResponse();
}
```

## 结构 {#anatomy}

引用链路包含选区工具条、输入区预览和已发送消息内的引用块。

```tsx
{/* inside the quoting user message, only when it carries a quote */}
<div data-slot="quote-block">
  <svg data-slot="quote-block-icon" />
  <p data-slot="quote-block-text">{quote.text}</p>
</div>

{/* portaled to document.body, only while a selection resolves to one message */}
<div data-slot="selection-toolbar">
  <button data-slot="selection-toolbar-quote" />
</div>

{/* inside the composer, only while a quote is set */}
<div data-slot="composer-quote">
  <svg data-slot="composer-quote-icon" />
  <span data-slot="composer-quote-text">{quote.text}</span>
  <button data-slot="composer-quote-dismiss" aria-label="关闭引用" />
</div>
```

## 示例 {#examples}

保留运行时的引用状态和操作，自定义各区域外观。

### 调整各部分样式 {#restyle-the-pieces}

使用 `ComposerQuotePreview.Root` 等子组件重组摘要与清除按钮。

```tsx
<QuoteBlock.Root className="my-custom-class">
  <QuoteBlock.Icon />
  <QuoteBlock.Text>{quote.text}</QuoteBlock.Text>
</QuoteBlock.Root>

<SelectionToolbar.Root>
  <SelectionToolbar.Quote>引用回复</SelectionToolbar.Quote>
</SelectionToolbar.Root>

<ComposerQuotePreview.Root>
  <ComposerQuotePreview.Icon />
  <ComposerQuotePreview.Text />
  <ComposerQuotePreview.Dismiss />
</ComposerQuotePreview.Root>
```

### 直接读取引用 {#read-the-quote-without-quoteblock}

用 `useMessageQuote` 读取当前消息的引用，交给自己的布局。

```tsx
import { useMessageQuote } from "@assistant-ui/react";

function CustomQuoteDisplay() {
  const quote = useMessageQuote();
  if (!quote) return null;
  return <blockquote className="italic">{quote.text}</blockquote>;
}
```

### 从其他位置清除引用 {#clear-the-quote-from-elsewhere}

调用助手客户端的 composer 引用操作，可从输入区之外移除当前引用。

```tsx
import { useAui } from "@assistant-ui/react";

function ClearQuoteButton() {
  const aui = useAui();
  return (
    <button type="button" onClick={() => aui.composer.setQuote(undefined)}>
      Clear quote
    </button>
  );
}
```

## API 参考 {#api-reference}

消息引用和待发送引用分别由消息作用域和输入区作用域读取。

### QuoteBlock {#quoteblock}

显示已发送消息的引用文本。

### SelectionToolbar {#selectiontoolbar}

在可引用的消息文字被选中时提供快捷操作。

### ComposerQuotePreview {#composerquotepreview}

显示待发送引用，并提供清除控件。

### 引用状态与操作 {#quote-state-and-actions}

消息侧读取引用元数据，输入区可设置或清空待发送引用。

## 引用回复设计 {#the-quote-reply-design}

独立版本接收已选文字、当前引用和操作配置。

```sh
npx shadcn@latest add "@assistant-ui/elements-quote-reply"
```

```tsx
<SelectionToolbar.Root>
  <SelectionToolbar.Quote>Quote</SelectionToolbar.Quote>
  <button onClick={() => explain(window.getSelection()?.toString())}>Explain</button>
</SelectionToolbar.Root>
```

```tsx
"use client";

import { useState } from "react";
import { QuoteReply, type QuoteAction } from "@/components/assistant-ui/elements/quote-reply";

const actions: QuoteAction[] = [
  { key: "quote", label: "Quote", icon: "quote" },
  { key: "explain", label: "Explain", icon: "explain" },
  { key: "rewrite", label: "Rewrite", icon: "rewrite" },
];

export function Answer() {
  const [quoted, setQuoted] = useState<string>();

  return (
    <QuoteReply
      before="这份条约签订于 "
      selection="1648"
      after=", ending the Thirty Years' War."
      actions={actions}
      toolbarVisible
      quoted={quoted}
      onAction={(key) => {
        if (key === "quote") setQuoted("1648");
      }}
    />
  );
}
```

### QuoteReply {#quotereply}

应用可以控制引用文字并响应选区工具条的动作，使用 `QuoteAction` 配置操作。
