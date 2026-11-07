---
title: Streaming text（流式文本）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Streaming text（流式文本）

逐步显示流式文本，并短暂高亮刚收到的内容。

流式生成时，最后两个词以蓝色显示，末尾带有光标。更早出现的词会逐渐恢复为普通文本。运行时版接收消息片段的累计文本和运行状态。独立版由调用方维护文本段和显示数量。

<demo react="assistant-ui/streaming-text-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-streaming-text"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-streaming-text.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`MessagePrimitive.Parts` 直接向自定义渲染器传递消息片段的 `text` 和 `status`，无需单独编写选择器。`count` 表示当前字符串里的词数。

### 注册为消息片段渲染器 {#register-it-as-a-part-renderer}

```tsx
"use client";

import { useMemo } from "react";
import type { TextMessagePartComponent } from "@assistant-ui/react";
import { StreamingText, type Segment } from "@/components/assistant-ui/elements/streaming-text";

const StreamingTextPart: TextMessagePartComponent = ({ text, status }) => {
  const segments = useMemo<Segment[]>(() => [{ text }], [text]);
  const count = useMemo(() => text.split(" ").length, [text]);
  return <StreamingText segments={segments} count={count} streaming={status.type === "running"} />;
};
```

`TextMessagePartComponent` 与 `MessagePrimitive.Parts` 的 `Text` 插槽类型匹配，可以直接注册。

### 接入消息片段列表 {#plug-it-into-the-parts-list}

```tsx
import { MessagePrimitive } from "@assistant-ui/react";

<MessagePrimitive.Parts components={{ Text: StreamingTextPart, Reasoning: StreamingTextPart }} />
```

`ReasoningMessagePartComponent` 同样提供 `text` 和 `status`，可以复用这段渲染逻辑。片段的 `status.type` 变为 `"complete"` 时，光标消失，最后两个词恢复为普通文本。

**独立版**

传入文本段和当前显示数量。组件负责淡入、淡出和高亮。

### 维护文本段和显示数量 {#hold-segments-and-a-reveal-count}

```tsx
"use client";

import { useState } from "react";
import { StreamingText, type Segment } from "@/components/assistant-ui/elements/streaming-text";

const SEGMENTS: Segment[] = [
  { text: "回复 会 分段 流式生成。" },
  { text: "useAuiState", mono: true },
  { text: "可 读取 当前 已收到 的 文本 片段。" },
];

export function Answer() {
  const [count, setCount] = useState(0);
  return <StreamingText segments={SEGMENTS} count={count} streaming={count < 12} />;
}
```

`mono: true` 将该段中的每个词渲染成行内代码样式。

### 逐步增加显示数量 {#advance-the-count-yourself}

```tsx
useEffect(() => {
  const id = setInterval(() => setCount((c) => Math.min(c + 1, 12)), 90);
  return () => clearInterval(id);
}, []);
```

调用方负责增加 `count`。超出范围的值会被限制在有效区间内。

## 结构 {#anatomy}

```tsx
<p data-slot="streaming-text">
  {/* revealed words, newest two tinted while streaming */}
  <span aria-hidden />{/* caret, only while streaming and at least one word is shown */}
</p>
```

上游组件默认按空格切分各段文本，并在词之间插入空格。渲染时会合并连续空格和换行。`count` 限制在 0 和总词数之间，负数或 `NaN` 会隐藏所有词，超过总词数会显示全部内容。`streaming` 为 `true` 时，最后两个词高亮。词离开高亮范围后，会用 700 毫秒过渡到普通文本。流式生成时，只要显示了至少一个词，末尾就会显示光标。

## 示例 {#examples}

### 将文本段标记为代码 {#marking-a-span-as-code}

```tsx
const segments: Segment[] = [
  { text: "读取值" },
  { text: "response.data", mono: true },
  { text: "格式化之前。" },
];
```

### 重新设置文本样式 {#restyle-the-text}

两种用法都支持用 `className` 调整根元素。默认类名为 `min-h-[8.5rem] max-w-sm text-sm leading-relaxed text-pretty`。高亮文字和光标分别使用 `text-blue-500` 和 `bg-blue-500`，组件没有单独设置这两种颜色的属性。

```tsx
<StreamingText className="max-w-none text-base" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息片段渲染器属性 {#part-renderer-props}

| 属性 | 类型 | 说明 |
| -------- | ------------------- | --------------------------------------------------- |
| `text` | `string` | 到目前为止，该部件的字符串已流式传输。 |
| `status` | `MessagePartStatus` | `status.type === "running"` 直到片段稳定。 |

注册在 `MessagePrimitive.Parts` 的 `Text` 或 `Reasoning` 插槽中的组件都会收到这些属性。`TextMessagePartComponent` 和 `ReasoningMessagePartComponent` 都定义了这两个字段。

**独立版**

### StreamingText {#streamingtext}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ----------- | -------- | -------------------------------------------------------------------------------------------- |
| `segments` | `Segment[]` |  | `{ text: string; mono?: boolean }[]`，按空格分割并连接成一个字流。 |
| `count` | `number` |  | 要显示的字数，限制在 0 和总字数之间。 |
| `streaming` | `boolean` |  | 对最新显示的两个单词进行着色并呈现尾随插入符号。 |
| `className` | `string` |  | 合并到根元素。 |

除 `children`、`segments`、`count` 和 `streaming` 之外的其余 `p` 属性会传给根元素。
