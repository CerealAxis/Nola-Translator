---
title: Markdown text（Markdown 文本）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Markdown text（Markdown 文本）

把助手的文本消息渲染成 Markdown，支持标题、列表、链接、引用、表格与带复制按钮的代码块。

<demo react="assistant-ui/markdown-text-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/markdown-text"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/new-york/markdown-text.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

首次接入运行时时，执行初始化命令，再用 `AssistantRuntimeProvider` 包住需要读取会话状态的组件。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk"

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
```

首次配置可参阅 [assistant-ui 安装指南](https://www.assistant-ui.com/docs/installation)。

此组件读取当前消息片段，使用时需要运行时。

## 开始使用 {#getting-started}

### 接入消息 {#wire-it-into-the-message}

`MarkdownTextPrimitive` 从当前片段读取文本。用 `MessagePrimitive.Parts` 将 `MarkdownText` 注册为文本片段的渲染器。`Thread` 已内置这项配置。

```tsx
import { MessagePrimitive } from "@assistant-ui/react"
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text"

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  )
}
```

### 添加语法高亮 {#add-syntax-highlighting}

代码块默认显示原文、语言标签和复制操作。可通过 `components.SyntaxHighlighter` 应用统一高亮，也可通过 `componentsByLanguage` 给指定语言单独设置渲染器。可使用官方的 [Shiki 高亮](https://www.assistant-ui.com/elements/shiki-highlighter) 或 [语法高亮](https://www.assistant-ui.com/elements/syntax-highlighter)。

在消息上下文之外渲染普通 Markdown 字符串时，可直接使用 `react-markdown`。

## 结构 {#anatomy}

```html
<div class="aui-md" data-status="complete">
  <h2 class="aui-md-h2">译文校对清单</h2>
  <p class="aui-md-p">先核对术语，再检查格式。</p>
  <div class="aui-code-header-root">
    <span>ts</span>
    <button aria-label="复制"></button>
  </div>
  <pre><code>const status = "校对完成"</code></pre>
</div>
```

根元素的 `data-status` 表示正在生成（`running`）、完成（`complete`）或中断（`incomplete`）。标题、段落、表格等带有对应的 `aui-md-*` 类。每个围栏代码块由语言标签、复制按钮和 `pre` 内的代码组成。复制成功后，按钮会暂时显示勾选图标。

## 示例 {#examples}

### 覆盖单个元素 {#override-one-element}

`components` 与默认渲染器合并。以下示例只更改链接打开方式。

```tsx
<MarkdownText
  components={{
    a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
  }}
/>
```

### 扩展代码块头部 {#extend-the-code-block-header}

`CodeHeader` 接收语言和代码正文，可替换头部操作。

```tsx
import type { CodeHeaderProps } from "@assistant-ui/react-markdown"

function CustomCodeHeader({ language, code }: CodeHeaderProps) {
  return (
    <div>
      <span>{language}</span>
      <button type="button" onClick={() => navigator.clipboard.writeText(code)}>
        复制代码
      </button>
    </div>
  )
}

<MarkdownText components={{ CodeHeader: CustomCodeHeader }} />
```

### GitHub 风格 Markdown {#github-flavored-markdown}

组件已启用 `remarkGfm`，可直接渲染表格、任务列表、删除线和自动识别的链接。页首预览包含表格和任务列表。

```md
| 检查项 | 状态 |
| --- | --- |
| 人名与地名 | 已完成 |

- [x] 对照术语表
- [ ] 检查标点

~~旧版译文~~ · https://www.assistant-ui.com/
```

### 处理助手输出的图片 {#images-from-assistant-output}

渲染模型生成的 Markdown 时，可给 `MarkdownTextPrimitive` 设置 `urlTransform`，为图片限定允许的来源。

```tsx
import { defaultUrlTransform } from "react-markdown"

<MarkdownTextPrimitive
  urlTransform={(url, key) =>
    key === "src" && !url.startsWith("https://cdn.example.com/")
      ? ""
      : defaultUrlTransform(url)
  }
/>
```

## API 参考 {#api-reference}

### MarkdownTextPrimitive {#markdowntextprimitive}

从当前文本或推理片段读取内容，渲染为 `div`，并通过 `data-status` 暴露流式状态。

### MarkdownText {#markdowntext}

| 属性 | 说明 |
| --- | --- |
| `components` | 合并到默认的元素渲染器。支持标题、段落、链接、列表、引用、表格、代码及 `CodeHeader` 等。 |
| `componentsByLanguage` | 按围栏代码块的语言指定 `SyntaxHighlighter` 或 `CodeHeader`。 |

组件从消息上下文读取正文。需要改变渲染层容器样式时，可在外面包一层元素，或替换对应的元素渲染器。
