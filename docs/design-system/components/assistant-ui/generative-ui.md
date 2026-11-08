---
title: Generative UI（生成式界面）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Generative UI（生成式界面）

将结构化的生成结果渲染成由样式化组件组成的界面。

<demo react="assistant-ui/generative-ui-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/generative-ui"
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

把组件库提供给生成式 UI 工具，或直接渲染已有规格。

### 围绕组件库构建工具包 {#build-a-toolkit-around-the-library}

用 `defineToolkit` 注册 `JSONGenerativeUI`，由组件库决定允许模型使用的组件和属性。

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { JSONGenerativeUI } from "@assistant-ui/generative-ui/react";
import { styledGenerativeUILibrary } from "@/components/assistant-ui/elements/generative-ui";

const generative = new JSONGenerativeUI({ library: styledGenerativeUILibrary });

export default defineToolkit({
  present: generative.present(),
});
```

### 注册到运行时 {#register-it-on-your-runtime}

用 `AuiConfig` 与 `Tools` 注册工具包，运行时据此展示消息中的生成界面。

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import toolkit from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export default function Page() {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

### 直接渲染规格 {#render-a-spec-directly}

使用 `renderGenerativeUI` 和组件库渲染已有规格，可指定当前状态和操作分发函数。

```tsx
import { renderGenerativeUI } from "@assistant-ui/generative-ui/react";
import { styledGenerativeUILibrary } from "@/components/assistant-ui/elements/generative-ui";

function Report() {
  return renderGenerativeUI(
    { $type: "Markdown", value: "本季度**收入**增长了 12%。" },
    styledGenerativeUILibrary,
  );
}
```

## 示例 {#examples}

可以替换单个组件，增加新组件，或独立使用 Markdown 渲染器。

### 查看覆盖效果 {#see-the-override-in-action}

用相同规格分别渲染默认组件库和样式化组件库，比较替换后的展示。

```tsx
import { defaultGenerativeUILibrary, renderGenerativeUI } from "@assistant-ui/generative-ui/react";
import { styledGenerativeUILibrary } from "@/components/assistant-ui/elements/generative-ui";

renderGenerativeUI({ $type: "Markdown", value: "**bold**" }, defaultGenerativeUILibrary); // <div data-aui="markdown">**bold**</div>
renderGenerativeUI({ $type: "Markdown", value: "**bold**" }, styledGenerativeUILibrary); // <div data-aui="markdown"><strong>bold</strong></div>
```

### 用自定义组件扩展库 {#extend-the-library-with-your-own-component}

扩展库时给新组件定义 Zod 属性约束和 React 渲染函数。

```tsx
import { JSONGenerativeUI } from "@assistant-ui/generative-ui/react";
import { styledGenerativeUILibrary } from "@/components/assistant-ui/elements/generative-ui";
import { z } from "zod";

const library = {
  ...styledGenerativeUILibrary,
  Callout: {
    description: "一条重点备注。",
    properties: z.object({ text: z.string() }),
    render: ({ text }: { text: string }) => <div data-aui="callout">{text}</div>,
  },
};

const generative = new JSONGenerativeUI({ library });
```

### 独立使用 Markdown 渲染器 {#use-the-markdown-renderer-on-its-own}

直接渲染 `GenerativeMarkdown`，适用于工具内容中单独提供的 Markdown。

```bash
npx assistant-ui@latest add elements-generative-markdown
```

```tsx
import { GenerativeMarkdown } from "@/components/assistant-ui/elements/generative-markdown";

<GenerativeMarkdown value="本季度**收入**增长了 12%。" />;
```

## API 参考 {#api-reference}

工具构建与直接渲染使用同一套规格和组件库。

### JSONGenerativeUI {#jsongenerativeui}

为生成式 UI 规格创建工具定义，并关联组件库。

### renderGenerativeUI {#rendergenerativeui}

接受规格、组件库和渲染选项，返回可嵌入 React 页面中的内容。
