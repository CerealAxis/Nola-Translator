---
title: Artifact card（产物卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Artifact card（产物卡片）

展示正在生成或已完成的产物，提供标题和实时字数。

<demo react="assistant-ui/artifact-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-artifact-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-artifact-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染工具调用

将工具参数中的 title、meta 和 words 传给卡片。`status.type` 为 "running" 时启用 generating。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { ArtifactCard } from "@/components/assistant-ui/elements/artifact-card";

export const toolkit = defineToolkit({
  write_document: {
    type: "backend",
    render: ({ args, status }) => (
      <ArtifactCard
        title={args.title}
        meta={args.meta}
        generating={status.type === "running"}
        words={args.words ?? 0}
      />
    ),
  },
});
```

### 注册工具包

把工具包注册到运行时，消息列表会在对应工具调用处显示产物。

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { toolkit } from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存产物状态

独立版持有 title、meta、generating 和 words。

```tsx
"use client";

import { useState } from "react";
import { ArtifactCard } from "@/components/assistant-ui/elements/artifact-card";

export function Artifact() {
  const [generating, setGenerating] = useState(true);
  const [words, setWords] = useState(0);

  return (
    <ArtifactCard
      title="草稿持久化提案"
      meta="文档 · v3 · 刚刚"
      generating={generating}
      words={words}
    />
  );
}
```

### 更新生成进度

写入时逐步更新 words，写完后把 generating 设为 false。

```tsx
useEffect(() => {
  if (!generating) return;
  const id = setInterval(() => setWords((w) => w + 4), 100);
  return () => clearInterval(id);
}, [generating]);

function finish() {
  setGenerating(false);
}
```

## 结构 {#anatomy}

卡片显示文档图标、单行标题和说明。生成期间在说明位置显示实时字数。

```tsx
<div data-slot="artifact-card">
  <span>{/* 生成期间显示 */}</span>
  <div>
    <p>{/* 显示名称或标题 */}</p>
    <p>
      {/* 对应槽位内容 */}
      {/* 对应槽位内容 */}
    </p>
  </div>
  <span>{/* 鼠标悬停或键盘聚焦时显示 */}</span>
</div>
```

生成提示和完成说明交替显示。箭头在悬停时出现。组件会转发根元素上的点击事件，调用方可将它连接到打开产物的动作。

## 示例 {#examples}

### 调整卡片样式

通过 `className` 调整根元素。

```tsx
<ArtifactCard className="max-w-sm" /* ... */ />
```

### 让卡片可操作

在外层连接真实的打开动作或链接，根据生成状态决定可否打开。

```tsx
<ArtifactCard
  title="草稿持久化提案"
  meta="文档 · v3 · 刚刚"
  onClick={() => openDocument("draft-persistence-rfc")}
/>
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 来源 | 类型 | 说明 |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `args.title` | `string` | 标题。 |
| `args.meta` | `string` | 补充信息。 |
| `args.words` | `number \| undefined` | 正在生成或朗读的文本内容，具体类型见上表。 |
| `status.type` | `"running" \| "requires-action" \| "incomplete" \| "complete"` | 当前状态的类型，决定界面所显示的阶段。 |

**独立使用**

### ArtifactCard

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | --------- | -------- | ------------------------------------------------------ |
| `title` | `string` | 必填 | 标题。 |
| `meta` | `string` | 必填 | 补充信息。 |
| `generating` | `boolean` | `false` | 产物仍在生成时为 true。 |
| `words` | `number` | `0` | 产物生成期间显示的字数，缺省为 0。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
