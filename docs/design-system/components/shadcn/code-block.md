---
title: Code Block（代码块）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Code Block（代码块）

显示代码、终端输出和差异，可选择显示页头、行号及复制按钮。

<demo react="shadcn-base/code-block-demo.tsx" />

`CodeBlock` 显示代码、终端输出、日志和差异。支持带标题和操作的页头、行号、换行、差异及行高亮，还提供用于在 [Trace](https://ui.shadcn.com/docs/components/base/trace) 中显示工具输出的小尺寸。

语法高亮是可选功能，由单独的 Hook 提供，因此只显示纯文本输出的代码块可以保持轻量。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add code-block
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install shiki
```

**2. 安装所需的 shadcn/ui 依赖：**

```bash
npx shadcn@latest add button
```

**3. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/code-block.tsx [components/ui/code-block.tsx]

<<< @/media-src/vis/shadcn-base/registry/bases/base/hooks/use-highlighted-code.ts [hooks/use-highlighted-code.ts]

<<< @/media-src/vis/shadcn-base/registry/bases/base/lib/highlighter.tsx [lib/highlighter.tsx]

**4. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

`code-block` 还会安装用于[语法高亮](#syntax-highlighting)的 `useHighlightedCode`。

## 用法 {#usage}

```tsx:line-numbers
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/components/ui/code-block"
```

```tsx:line-numbers
<CodeBlock>
  <CodeBlockHeader>
    <CodeBlockTitle>Terminal</CodeBlockTitle>
    <CodeBlockActions>
      <CodeBlockCopyButton value={output} />
    </CodeBlockActions>
  </CodeBlockHeader>
  <CodeBlockContent>{output}</CodeBlockContent>
</CodeBlock>
```

## 结构 {#composition}

```text
CodeBlock
├── CodeBlockHeader
│   ├── CodeBlockTitle
│   └── CodeBlockActions
│       └── CodeBlockCopyButton
├── CodeBlockActions (floating, when there is no header)
├── CodeBlockContent
│   └── CodeBlockLine
└── CodeBlockFooter
```

`CodeBlockContent` 接受字符串或一组 `CodeBlockLine`。需要行变体或语法高亮时，请使用 `CodeBlockLine`。

## 功能 {#features}

- **流式输出的开销低。** 字符串子项渲染为一个文本节点，流式接收代码时，高亮器只对新行分词。
- **复制结果干净。** 行号和差异标记不会被选中，空行在复制时会保留。
- **从左到右阅读。** 内容始终采用 `dir="ltr"`，页头则遵循页面方向。
- **高亮无需 WASM。** `useHighlightedCode` 使用 Shiki 的 JavaScript 引擎，在首次使用每种语言时加载它，并在终端输出中呈现 ANSI 颜色。服务端使用 `highlightCode` 可避免将 Shiki 打包进客户端。
- **适合各类代码场景。** 可用于消息、Markdown 围栏、Trace 行、Tabs、Dialog 或 `typeset` 容器。
- **支持键盘滚动。** 内容可以聚焦，浮动操作既会在悬停时显示，也会在聚焦时显示。

## 基础 {#basic}

将字符串传给 `CodeBlockContent`。它渲染为一个文本节点，因此流式输出时开销较低。

<demo react="shadcn-base/code-block-basic.tsx" />

## 页头 {#header}

`CodeBlockHeader` 容纳 `CodeBlockTitle` 和 `CodeBlockActions`。`CodeBlockCopyButton` 复制它的 `value`。

<demo react="shadcn-base/code-block-header.tsx" />

过长的标题会截断。若要让标题链接到文件，请用链接元素包裹 `CodeBlockTitle`。

```tsx:line-numbers
<CodeBlockHeader>
  <a href="/files/route.ts">
    <CodeBlockTitle>app/api/chat/route.ts</CodeBlockTitle>
  </a>
</CodeBlockHeader>
```

## 操作 {#actions}

`CodeBlockActions` 可容纳任意数量的按钮。若要提供换行开关，请自行管理状态并传给 `wrap`。

<demo react="shadcn-base/code-block-actions.tsx" />

```tsx:line-numbers
const [wrap, setWrap] = React.useState(false)

<CodeBlockActions>
  <Button
    variant="ghost"
    size="icon-xs"
    aria-label="Wrap lines"
    aria-pressed={wrap}
    onClick={() => setWrap(!wrap)}
  >
    <WrapTextIcon />
  </Button>
  <CodeBlockCopyButton value={output} />
</CodeBlockActions>
<CodeBlockContent wrap={wrap}>{output}</CodeBlockContent>
```

## 浮动操作 {#floating-actions}

没有页头时，可将 `CodeBlockActions` 直接放在 `CodeBlock` 内。操作浮动在顶部的末端，代码块悬停或聚焦时才显示。在触摸屏上始终显示。

<demo react="shadcn-base/code-block-floating-actions.tsx" />

## 行号 {#line-numbers}

为 `CodeBlockContent` 添加 `lineNumbers`。字符串子项会拆成多行，选中内容复制时不包含行号。

<demo react="shadcn-base/code-block-line-numbers.tsx" />

## 起始行 {#start-line}

使用 `startLine` 从指定行开始编号，适合展示文件中间的片段。行号栏会自动加宽，以容纳位数最多的行号。

<demo react="shadcn-base/code-block-start-line.tsx" />

## 换行 {#wrap}

长行默认可横向滚动。添加 `wrap` 可换行显示，适合工具输出和错误消息。若要让读者切换换行设置，请参阅[操作](#actions)。

<demo react="shadcn-base/code-block-wrap.tsx" />

## 高亮行 {#highlighted-lines}

将每行渲染为 `CodeBlockLine`，并在要强调的行上设置 `variant="highlighted"`。

<demo react="shadcn-base/code-block-highlighted-lines.tsx" />

## 差异 {#diff}

在 `CodeBlockLine` 上设置 `variant="added"` 或 `variant="removed"`，分别添加 `+` 或 `−` 标记。

<demo react="shadcn-base/code-block-diff.tsx" />

## 高度 {#height}

使用 `CodeBlockContent` 上的 `max-h-*` 类限制高度，内容会在块内滚动。

<demo react="shadcn-base/code-block-height.tsx" />

滚动时，`CodeBlockContent` 会使用 [`scroll-fade`](https://ui.shadcn.com/docs/utils/scroll-fade) 让边缘渐隐，默认为左右两侧，换行时为上下两侧。对于限高且不换行的代码块，可添加 `scroll-fade-y`。

## 显示更多 {#show-more}

`CodeBlockFooter` 是内容下方的插槽。要实现「显示更多」，可在折叠时限制内容高度，并在页脚中放一个使用 ghost 变体的 `xs` 尺寸 `Button`。

<demo react="shadcn-base/code-block-show-more.tsx" />

```tsx:line-numbers
const [expanded, setExpanded] = React.useState(false)
const id = React.useId()

<CodeBlockContent
  id={id}
  className={expanded ? undefined : "max-h-64 overflow-y-hidden scroll-fade-y"}
>
  {code}
</CodeBlockContent>
<CodeBlockFooter className="justify-center">
  <Button
    variant="ghost"
    size="xs"
    aria-expanded={expanded}
    aria-controls={id}
    onClick={() => setExpanded(!expanded)}
  >
    {expanded ? "Show less" : "Show more"}
  </Button>
</CodeBlockFooter>
```

### 最大高度 {#max-height}

要避免长代码块占满页面，可以在展开时提高高度上限。展开的内容可滚动，边缘会随滚动渐隐。

<demo react="shadcn-base/code-block-show-more-scroll.tsx" />

## 尺寸 {#size}

工具和 [Trace](#trace) 输出可使用 `size="sm"`。它使用更紧凑的内边距和 `text-xs` 文字。

<demo react="shadcn-base/code-block-size.tsx" />

## 危险操作 {#destructive}

错误和失败输出使用 `variant="destructive"`。

<demo react="shadcn-base/code-block-destructive.tsx" />

## Trace {#trace}

在 `TraceCollapsibleContent` 中放置 `size="sm"` 的 `CodeBlock`，用于显示工具和终端输出。为 `CodeBlockContent` 添加 `wrap` 和 `max-h-64` 类，使长输出在 Trace 内换行并滚动。代码块自行设置文字颜色，因此 `TraceCollapsibleContent` 不会将其淡化。

<demo react="shadcn-base/code-block-trace.tsx" />

## 标签页 {#tabs}

用 [Tabs](https://ui.shadcn.com/docs/components/base/tabs) 显示多个文件，在每个 `TabsContent` 中放一个 `CodeBlock`。

<demo react="shadcn-base/code-block-tabs.tsx" />

## 消息 {#message}

将 `CodeBlock` 放在 [Message](https://ui.shadcn.com/docs/components/base/message) 内的段落之间。

<demo react="shadcn-base/code-block-chat.tsx" />

## Typeset {#typeset}

`CodeBlock` 放入 [`typeset`](https://ui.shadcn.com/docs/typeset) 容器后，会保留自身样式，上方间距与段落一致。

<demo react="shadcn-base/code-block-typeset.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。 Code always reads left to right. The header follows the page direction.

<demo react="shadcn-base/code-block-rtl.tsx" />

## 语法高亮 {#syntax-highlighting}

`useHighlightedCode` 使用 [Shiki](https://shiki.style) 高亮代码，为 `CodeBlockLine` 的每行返回一个 React 节点。

<demo react="shadcn-base/code-block-highlighting.tsx" />

```tsx:line-numbers
const lines = useHighlightedCode(code, "json")

<CodeBlock>
  <CodeBlockContent>
    {lines.map((line, index) => (
      <CodeBlockLine key={index}>{line}</CodeBlockLine>
    ))}
  </CodeBlockContent>
</CodeBlock>
```

Shiki 使用 JavaScript 正则表达式引擎，因此无需加载 WASM。

### 语言 {#languages}

每种语言在首次使用时加载。可在 `lib/highlighter.tsx` 中编辑语言列表。列表以外的语言会按纯文本渲染。

<demo react="shadcn-base/code-block-languages.tsx" />

默认列表包括 `bash`、`css`、`diff`、`html`、`javascript`、`json`、`jsx`、`markdown`、`python`、`sql`、`tsx`、`typescript` 和 `yaml`，以及 `ts`、`js`、`sh` 和 `yml` 等别名。

### 终端输出 {#terminal-output}

将语言设为 `"ansi"`，即可显示终端输出中的颜色。未设置时，转义码会显示为文本。

<demo react="shadcn-base/code-block-ansi.tsx" />

ANSI 颜色不会延续到下一行。

### 服务端渲染 {#server-rendering}

`highlightCode` 是异步函数，可在服务端组件中使用，因此无需将 Shiki 打包进客户端。

```tsx:line-numbers
import { highlightCode } from "@/lib/highlighter"

export async function ServerCode({ code }: { code: string }) {
  const lines = (await highlightCode(code, "tsx")) ?? code.split("\n")

  return (
    <CodeBlock>
      <CodeBlockContent lineNumbers>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}
```

### 流式输出 {#streaming}

代码流式传输时，Hook 会从上次结束的行开始，只对新行分词。未更改的行保留原节点，因此 React 会跳过这些行。

<demo react="shadcn-base/code-block-streaming.tsx" />

### Markdown {#markdown}

用 [Streamdown](https://streamdown.ai) 渲染消息，并通过 `components.code` 将围栏代码交给 `CodeBlock` 渲染。Streamdown 只为围栏代码设置 `data-block`，行内代码仍会在行内显示。

<demo react="shadcn-base/code-block-markdown.tsx" />

在收到闭合围栏之前，`useIsCodeFenceIncomplete` 会返回 `true`。用它在代码还不完整时禁用复制按钮。Streamdown 收到 `isAnimating` 时此 Hook 才会生效，因此请在消息流式传输期间传入 `isAnimating`。

```tsx:line-numbers
<Streamdown components={{ code: MarkdownCode }} isAnimating={isStreaming}>
  {text}
</Streamdown>
```

## 无障碍 {#accessibility}

- `CodeBlockContent` 是包含 `code` 元素的 `pre`，始终设置 `dir="ltr"`，因此在 RTL 页面上仍按从左到右的顺序阅读代码。
- `CodeBlockContent` 设置了 `tabIndex={0}`，键盘用户可以聚焦并滚动。传入 `tabIndex={-1}` 可将其从 Tab 顺序中移除。
- 焦点位于块内时也会显示浮动操作，因此键盘用户同样可以使用它们。
- 屏幕阅读器不会读出行号。
- 差异行除了着色，还带有 `+` 或 `−` 标记，因此用户也能通过标记识别变更。
- `CodeBlockCopyButton` 的标签为「Copy」。复制成功后，礼貌级实时区域会播报「Copied」。
- 为换行开关设置 `aria-pressed`，以便辅助技术播报它的状态。
- 为「显示更多」按钮设置 `aria-expanded`，并将 `aria-controls` 指向 `CodeBlockContent` 的 `id`。

## API 参考 {#api-reference}

### CodeBlock {#codeblock}

容纳页头、内容和页脚的容器。

| 属性        | 类型                         | 默认值     | 说明                                                     |
| ----------- | ---------------------------- | ----------- | --------------------------------------------------------------- |
| `variant`   | `"default" \| "destructive"` | `"default"` | 代码块的视觉语气。 |
| `size`      | `"default" \| "sm"`          | `"default"` | `"sm"` 使用更紧凑的内边距和 `text-xs` 代码文字，适合工具输出。 |
| `className` | `string`                     | -           | 应用于代码块的附加类。 |

### CodeBlockHeader {#codeblockheader}

位于内容上方的一行，用于放置标题和操作。

| 属性        | 类型     | 默认值 | 说明                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | -       | 应用于页头的附加类。 |

### CodeBlockTitle {#codeblocktitle}

文件名或标签，可选显示图标。过长时会截断。

| 属性        | 类型     | 默认值 | 说明                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | -       | 应用于标题的附加类。 |

### CodeBlockActions {#codeblockactions}

容纳页头末端的按钮。作为 `CodeBlock` 的直接子项时会浮动显示。

| 属性        | 类型     | 默认值 | 说明                                 |
| ----------- | -------- | ------- | ------------------------------------------- |
| `className` | `string` | -       | 应用于操作容器的附加类。 |

### CodeBlockCopyButton {#codeblockcopybutton}

使用 ghost 变体的图标按钮，将 `value` 复制到剪贴板。它接受 [`Button`](https://ui.shadcn.com/docs/components/base/button) 的属性。

| 属性        | 类型     | 默认值 | 说明                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `value`     | `string` | -       | 必填。要复制的文字。 |
| `className` | `string` | -       | 应用于按钮的附加类。 |

### CodeBlockContent {#codeblockcontent}

支持滚动或换行的 `pre`。

| 属性          | 类型              | 默认值 | 说明                                                     |
| ------------- | ----------------- | ------- | --------------------------------------------------------------- |
| `children`    | `React.ReactNode` | -       | 字符串或一组 `CodeBlockLine`。 |
| `wrap`        | `boolean`         | `false` | 让过长的行换行显示。 |
| `lineNumbers` | `boolean`         | `false` | 为每行编号。字符串子项会按行拆分。 |
| `startLine`   | `number`          | `1`     | 设置 `lineNumbers` 时的第一行行号。 |
| `tabIndex`    | `number`          | `0`     | 让内容可以聚焦，以便用键盘滚动。 |
| `className`   | `string`          | -       | 应用于内容的附加类，例如 `max-h-72`。 |

### CodeBlockLine {#codeblockline}

一行代码。

| 属性        | 类型                                                 | 默认值     | 说明                              |
| ----------- | ---------------------------------------------------- | ----------- | ---------------------------------------- |
| `variant`   | `"default" \| "added" \| "removed" \| "highlighted"` | `"default"` | 当前行的状态。 |
| `className` | `string`                                             | -           | 应用于当前行的附加类。 |

### CodeBlockFooter {#codeblockfooter}

位于内容下方的一行，例如用来放置「显示更多」按钮。

| 属性        | 类型     | 默认值 | 说明                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | -       | 应用于页脚的附加类。 |

### useHighlightedCode {#usehighlightedcode}

```tsx
const lines = useHighlightedCode(code, language)
```

每行返回一个 React 节点。在首次高亮处理完成前，以及语言不在列表中时，会返回纯文本行。

| 参数   | 类型     | 说明                                                  |
| ---------- | -------- | ------------------------------------------------------------ |
| `code` | `string` | 要高亮的代码。会忽略末尾的换行符。 |
| `language` | `string` | `lib/highlighter.tsx` 中的语言或别名，也可使用 `"ansi"`。 |
