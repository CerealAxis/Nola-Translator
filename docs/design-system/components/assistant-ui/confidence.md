---
title: Confidence（置信度）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Confidence（置信度）

标明一项结论来自资料、推断还是猜测。

ConfidenceMarker 通过确定性来强调答案中的每项主张：有依据、推断或不确定，并在悬停或焦点时显示依据。通过运行时，你可以根据结构化工具结果生成陈述列表。独立的你已经持有它了。

<demo react="assistant-ui/confidence-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-confidence-marker"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-confidence-marker.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui的消息内容没有内置的每个声明置信度概念：文本和引文是单独的内容部分，并且都不带有置信度等级。最接近的真实构建块是工具调用。要求模型以分级声明的形式返回其答案，并从 `tool-call` 部分读取结果。

### 从消息中读取工具结果 {#read-the-tool-result-off-the-message}

```tsx
"use client";

import { useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import type { ToolCallMessagePart } from "@assistant-ui/react";
import {
  ConfidenceMarker,
  type ConfidenceClaim,
} from "@/components/assistant-ui/elements/confidence-marker";

type CiteClaims = ToolCallMessagePart<unknown, { claims: ConfidenceClaim[] }>;

function ClaimsFromMessage() {
  const [hoveredId, setHoveredId] = useState("");
  const claims = useAuiState((s) =>
    s.message.role === "assistant"
      ? s.message.content.find(
          (part): part is CiteClaims =>
            part.type === "tool-call" && part.toolName === "cite_claims",
        )?.result?.claims
      : undefined,
  );

  if (!claims) return null;

  return <ConfidenceMarker claims={claims} hoveredId={hoveredId} onHover={setHoveredId} />;
}
```

   `cite_claims` 和 `{ claims: [...] }` 结果形状是你自己的工具合约。`part.result` 将你定义的任何内容带回客户端，并由你提供给 `ToolCallMessagePart` 的泛型键入。

### 为有依据的陈述提供真实引用 {#use-a-real-citation-for-the-grounded-tier-alone}

   当你需要的只是“此声明来自获取的源”而不是完整的三层等级时，`SourceMessagePart` 是运行时原生支持的类型，你可以直接渲染，而不是通过自定义工具路由它。请参阅下面的[只标注有依据的陈述](#a-grounded-only-version)。

**独立版**

独立，你已持有陈述清单。该组件仅跟踪哪个组件悬停或聚焦。

### 维护陈述列表和悬停状态 {#hold-the-claims-and-the-hover-state}

```tsx
"use client";

import { useState } from "react";
import {
  ConfidenceMarker,
  type ConfidenceClaim,
} from "@/components/assistant-ui/elements/confidence-marker";

const CLAIMS: ConfidenceClaim[] = [
  { id: "1", text: "输入框拥有从 0.14 开始的草稿。", confidence: "grounded", basis: "migration-0.14.md" },
  { id: "2", text: "大多数应用程序不需要恢复物效果。", confidence: "inferred", basis: "from the changed API" },
];

export function Answer() {
  const [hoveredId, setHoveredId] = useState("");
  return <ConfidenceMarker claims={CLAIMS} hoveredId={hoveredId} onHover={setHoveredId} />;
}
```

### 基础是纯文本 {#basis-is-plain-text}

   `basis` 是纯字符串。没有任何东西可以解析它。引用文档路径、搜索结果标题或“未测量”都是同等有效的值。

## 结构 {#anatomy}

```tsx
<div data-slot="confidence-marker">
  <p>{/* each claim as an inline button, underlined by confidence tier */}</p>
  <div>{/* fixed-height slot: the hovered/focused claim's basis pill, or nothing */}</div>
</div>
```

悬停和焦点都显示基础（`onMouseEnter`/`onFocus` 共享相同的 `onHover` 调用），因此可以从键盘访问它，而 `aria-describedby` 仅在属于焦点声明时才指向依据标签。无论是否显示任何内容，基础槽都有固定的高度，因此显示它不会改变上面的段落。该层由下划线样式标记，而不仅仅是颜色：实线表示有根据和推断，点表示不确定，因此这种区别在没有颜色的情况下仍然存在。

## 示例 {#examples}

### 只标注有依据的陈述 {#a-grounded-only-version}

**运行时版**

当你显示的每个声明都有来源支持时，将真实引文直接映射到相同的形状会完全跳过自定义工具：

```tsx
const claims: ConfidenceClaim[] = message.content
  .filter((part): part is SourceMessagePart => part.type === "source")
  .map((part) => ({
    id: part.id,
    text: part.title ?? part.url ?? part.id,
    confidence: "grounded",
    basis: part.sourceType === "url" ? part.url : (part.filename ?? part.title),
  }));
```

**独立版**

同样的缩小范围适用于你已持有的任何列表：当调用者只想要来源的声明时，仅保留置信度为 `"grounded"` 的声明。

```tsx
<ConfidenceMarker claims={claims.filter((c) => c.confidence === "grounded")} hoveredId={hoveredId} onHover={setHoveredId} />
```

### 调整下划线和依据标签 {#restyle-the-underline-and-basis-pill}

两种用法都支持通过 `className` 调整根元素。依据标签从 `surfaces.tsx` 读取共享的 `floating` 和 `mono` 表面。

```tsx
<ConfidenceMarker className="gap-3" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/字段 | 类型 | 说明 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `s.message.content` | `readonly ThreadAssistantMessagePart[]` | 在此搜索 `tool-call` 片段，你将其 `result` 塑造为声明列表。assistant-ui 没有内置置信度字段。 |
| `ToolCallMessagePart.result` | `TResult \| undefined` | 工具运行后的返回值，由你提供的 `ToolCallMessagePart<TArgs, TResult>` 泛型键入。 |
| `SourceMessagePart` | `{ type: "source"; sourceType: "url" \| "document"; id: string; url?: string; title?: string; filename?: string }` | 真正的引文部分，当“接地”是你唯一需要的层时很有用。 |

**独立版**

### ConfidenceMarker {#confidencemarker}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `claims` | `readonly ConfidenceClaim[]` |  | 要渲染的完整有序列表。 |
| `hoveredId` | `string` |  | 显示依据的陈述 ID。空字符串不显示任何内容。 |
| `onHover` | `(id: string) => void` |  | 在悬停或聚焦时使用声明 ID 进行调用，在离开或模糊时使用 `""` 进行调用。 |
| `className` | `string` |  | 合并到根元素。 |

### ConfidenceClaim {#confidenceclaim}

| 字段 | 类型 | 说明 |
| ------------ | ----------------------------------------- | ------------------------------------- |
| `id` | `string` |  |
| `text` | `string` |  |
| `confidence` | `"grounded" \| "inferred" \| "uncertain"` | 驱动下划线颜色和样式。 |
| `basis` | `string` | 显示在悬停/焦点胶囊形标签中。 |

其余 `div` 属性会传给根元素。
