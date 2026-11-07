---
title: Syntax highlighter（语法高亮）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Syntax highlighter（语法高亮）

用按语言加载的语法高亮器渲染 Markdown 代码块。

<demo react="assistant-ui/syntax-highlighter-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/syntax-highlighter"
```

## 快速开始 {#getting-started}

将高亮器注册为 Markdown 的代码渲染器，也可以直接使用。

### 添加到 MarkdownText 的组件配置 {#add-it-to-markdowntexts-components}

在 `MarkdownText` 的组件配置中替换代码渲染器，Markdown 围栏标注的语言会传给高亮器。

```tsx
import { SyntaxHighlighter } from "./syntax-highlighter";

const defaultComponents = memoizeMarkdownComponents({
  SyntaxHighlighter,
  h1: /* ... */,
  // ...other elements...
});
```

### 直接调用 {#call-it-directly}

传入代码内容与语言名，可在 Markdown 之外使用语法高亮。

```tsx
import { SyntaxHighlighter } from "@/components/assistant-ui/elements/syntax-highlighter";

<SyntaxHighlighter
  language="tsx"
  code="const x = 1;"
  components={{
    Pre: (props) => <pre {...props} />,
    Code: (props) => <code {...props} />,
  }}
/>;
```

## 结构 {#anatomy}

高亮器识别语言并为代码分词，主题决定每类记号的显示样式。

```tsx
<>
  <Pre className="dark:hidden">{/* Coldark Cold tokens */}</Pre>
  <Pre className="hidden dark:block">{/* Coldark Dark tokens */}</Pre>
</>
```

## 示例 {#examples}

按应用实际使用的语言加载语法，或使用完整语言集。

### 注册其他语言 {#register-another-language}

导入语言定义，再注册语言名，使对应的围栏代码能正确着色。

```tsx
import { PrismAsyncLight } from "react-syntax-highlighter";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";

PrismAsyncLight.registerLanguage("go", go);
```

### 加载全部语言 {#load-every-language-instead}

如果语言范围无法预先确定，可以加载完整版本；按需版适合可控的语言集合。

```tsx
import { makePrismAsyncSyntaxHighlighter } from "@assistant-ui/react-syntax-highlighter/full";
```

### 选择其他主题 {#choose-a-different-theme}

通过样式配置换用不同的主题，保持代码和行号可读。

```tsx
import { oneLight, oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

const LightSyntaxHighlighter = makePrismAsyncLightSyntaxHighlighter({
  style: oneLight,
  customStyle: syntaxHighlighterCustomStyle,
  className: "dark:hidden",
});
```

## API 参考 {#api-reference}

代码可直接渲染，也可作为 Markdown 的高亮组件。

### SyntaxHighlighter {#syntaxhighlighter}

传入代码文本、语言和适用的样式选项。
