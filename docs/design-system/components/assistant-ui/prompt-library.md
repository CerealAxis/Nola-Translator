---
title: Prompt library（提示词库）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Prompt library（提示词库）

浏览、搜索并插入保存的提示词。

<demo react="assistant-ui/prompt-library-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-prompt-library"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-prompt-library.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 连接编辑器插入操作

把插入动作连到会话编辑器，用选中的提示词更新草稿。

```tsx
"use client";

import { useAui } from "@assistant-ui/react";
import { useState } from "react";
import {
  PromptLibrary,
  type SavedPrompt,
} from "@/components/assistant-ui/elements/prompt-library";

export function PromptLibraryPanel({
  prompts,
}: {
  prompts: readonly SavedPrompt[];
}) {
  const aui = useAui();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? "");

  return (
    <PromptLibrary
      prompts={prompts}
      query={query}
      selectedId={selectedId}
      onQueryChange={setQuery}
      onSelect={setSelectedId}
      onInsert={(id) => {
        const prompt = prompts.find((p) => p.id === id);
        if (prompt) aui.composer.setText(prompt.body);
      }}
    />
  );
}
```

**独立使用**

### 保存列表、查询与选择

独立版持有提示词列表、查询和当前选中项，确认后由应用处理内容。

```tsx
"use client";

import { useState } from "react";
import { PromptLibrary } from "@/components/assistant-ui/elements/prompt-library";

const prompts = [
  {
    id: "bug-report",
    name: "问题报告",
    body: "说明问题、复现步骤和预期行为。",
    variables: [],
  },
  {
    id: "summarize",
    name: "Summarize {topic}",
    body: "用三句话为非技术读者概括{topic}。",
    variables: ["topic"],
  },
];

export function PromptLibraryPanel({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(prompts[0].id);

  return (
    <PromptLibrary
      prompts={prompts}
      query={query}
      selectedId={selectedId}
      onQueryChange={setQuery}
      onSelect={setSelectedId}
      onInsert={(id) => {
        const prompt = prompts.find((p) => p.id === id);
        if (prompt) onInsert(prompt.body);
      }}
    />
  );
}
```

## 结构 {#anatomy}

提示词按类别显示，列表项可显示名称、说明和变量数量。

```tsx
<div data-slot="prompt-library">
  <div>
    <svg /* 图标 */ />
    <input role="combobox" aria-expanded aria-controls placeholder="搜索提示词" />
  </div>
  <div role="listbox" aria-label="已保存的提示词">
    {/* 显示名称或标题 */}
  </div>
  {/* 对应槽位内容 */}
  {/* 区分当前选中项 */}
</div>
```

查询对提示词名称做不区分大小写的子串匹配。选中的提示词被筛掉时会隐藏预览。提供 `onSelect` 后，方向键在当前结果中移动。

## 示例 {#examples}

### 格式化变量数量

可以通过格式化回调调整变量计数文案。

```tsx
{prompt.variables.length > 0 && (
  <span>{`${prompt.variables.length} ${prompt.variables.length === 1 ? "var" : "vars"}`}</span>
)}
```

### 调整列表样式

使用 `className` 调整根元素布局。

```tsx
<PromptLibrary className="max-w-md" prompts={prompts} query={query} selectedId={selectedId} onQueryChange={setQuery} onSelect={setSelectedId} onInsert={onInsert} />
```

## API 参考 {#api-reference}

**使用运行时**

### 编辑器操作

| 选择器或调用 | 类型 | 说明 |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `aui.composer.setText(text)` | `(text: string) => void` | 将指定文本写入编辑器。 |

提示词目录的存储、查询和筛选由调用方实现。

**独立使用**

### PromptLibrary

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `prompts` | `readonly SavedPrompt[]` | 必填 | 可选择的提示词。 |
| `query` | `string` | 必填 | 当前搜索内容。 |
| `selectedId` | `string` | 必填 | 当前选中的提示词 ID。 |
| `onQueryChange` | `(query: string) => void` |  | 搜索内容改变时调用。 |
| `onSelect` | `(id: string) => void` |  | 用户选中条目时调用。 |
| `onInsert` | `(id: string) => void` |  | 插入选中提示词时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### SavedPrompt

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------- | -------- | ------------------------------------------------------------------------------- |
| `id` | `string` | 必填 | 条目的稳定标识。 |
| `name` | `string` | 必填 | 要显示的名称。 |
| `body` | `string` | 必填 | 要展示或插入的正文。 |
| `variables` | `readonly string[]` | 必填 | 提示词可用的变量。 |

其余 `div` 属性会转发给根元素。
