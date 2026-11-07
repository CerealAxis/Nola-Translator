---
title: Search in conversation（对话内搜索）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Search in conversation（对话内搜索）

在当前会话中搜索正文，跳转到匹配消息。

<demo react="assistant-ui/search-in-conversation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-conversation-search"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-conversation-search.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 收集会话内的匹配

读取会话消息的文本部分，从查询结果提取匹配片段和消息 ID。

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  ConversationSearch,
  type SearchHit,
} from "@/components/assistant-ui/elements/conversation-search";

const CONTEXT = 24;

export function ThreadSearchBar() {
  const messages = useAuiState((s) => s.thread.messages);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const hits = useMemo<SearchHit[]>(() => {
    if (query === "") return [];
    const needle = query.toLowerCase();
    const found: SearchHit[] = [];

    messages.forEach((message, messageIndex) => {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ");
      const haystack = text.toLowerCase();

      let from = 0;
      let at: number;
      while ((at = haystack.indexOf(needle, from)) !== -1) {
        found.push({
          id: `${message.id}-${at}`,
          before: text.slice(Math.max(0, at - CONTEXT), at),
          match: text.slice(at, at + query.length),
          after: text.slice(at + query.length, at + query.length + CONTEXT),
          position: (messageIndex / Math.max(1, messages.length - 1)) * 100,
        });
        from = at + query.length;
      }
    });

    return found;
  }, [messages, query]);

  return (
    <ConversationSearch
      query={query}
      hits={hits}
      activeIndex={activeIndex}
      onQueryChange={(next) => {
        setQuery(next);
        setActiveIndex(0);
      }}
      onStep={(delta) => {
        if (hits.length === 0) return;
        const next = (activeIndex + delta + hits.length) % hits.length;
        setActiveIndex(next);
        const [, messageId] = hits[next]!.id.match(/^(.+)-\d+$/) ?? [];
        document
          .querySelector(`[data-message-id="${messageId}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
    />
  );
}
```

**独立使用**

### 保存搜索状态

独立版保存查询、结果和当前命中，选择结果时定位消息。

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  ConversationSearch,
  type SearchHit,
} from "@/components/assistant-ui/elements/conversation-search";

const lines = [
  "这次迁移涉及三张表。",
  "回滚会移除新列并恢复索引。",
  "在预发布环境中重建索引大约需要四分钟。",
];

export function Transcript() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const hits = useMemo<SearchHit[]>(() => {
    if (query === "") return [];
    const needle = query.toLowerCase();
    return lines
      .map((line, i) => ({ line, i, at: line.toLowerCase().indexOf(needle) }))
      .filter(({ at }) => at !== -1)
      .map(({ line, i, at }) => ({
        id: `${i}`,
        before: line.slice(0, at),
        match: line.slice(at, at + query.length),
        after: line.slice(at + query.length),
        position: (i / (lines.length - 1)) * 100,
      }));
  }, [query]);

  return (
    <ConversationSearch
      query={query}
      hits={hits}
      activeIndex={activeIndex}
      onQueryChange={(next) => {
        setQuery(next);
        setActiveIndex(0);
      }}
      onStep={(delta) =>
        setActiveIndex((i) => (hits.length === 0 ? 0 : (i + delta + hits.length) % hits.length))
      }
    />
  );
}
```

## 结构 {#anatomy}

搜索框、匹配计数、结果列表与上一项和下一项操作组成搜索面板。

```tsx
<div data-slot="conversation-search">
  <div>
    <input aria-label="在会话中搜索" placeholder="在会话中搜索" />
    <span>{/* 对应槽位内容 */}</span>
    {onStep && (
      <>
        <button aria-label="上一个匹配项" />
        <button aria-label="下一个匹配项" />
      </>
    )}
  </div>
  {/* 区分当前选中项 */}
  <div>{/* 对应槽位内容 */}</div>
  <div>
    {/* 显示对应条目 */}
  </div>
</div>
```

`onStep` 只报告方向 `-1` 或 `1`，由调用方决定是否循环。活动索引被限制在命中范围内。没有结果时计数显示为 0。

## 示例 {#examples}

### 命中数据来源

在应用侧搜索消息或调用自己的索引，使用稳定 ID 关联到原消息。

### 调整标记样式

通过 `className` 调整面板或结果容器，保留匹配片段的高亮。

```tsx
<ConversationSearch className="max-w-md" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

会话内全文搜索由应用从运行时的消息数据构建。`MessagePrimitive.Root` 为每条消息设置 `data-message-id`，可用它滚动到匹配消息。

### 会话状态

| 选择器 | 类型 | 说明 |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `s.thread.messages` | `readonly MessageState[]` | 当前会话的消息列表。 |

**独立使用**

### ConversationSearch

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `query` | `string` | 必填 | 当前搜索内容。 |
| `hits` | `readonly SearchHit[]` | 必填 | 匹配的搜索结果。 |
| `activeIndex` | `number` | 必填 | 当前活动项的索引。 |
| `onQueryChange` | `(query: string) => void` |  | 搜索内容改变时调用。 |
| `onStep` | `(delta: number) => void` |  | 导航到上一个或下一个命中时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### SearchHit

| 字段 | 类型 | 说明 |
| ---------- | -------- | ------------------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `before` | `string` | 匹配文字之前的片段。 |
| `match` | `string` | 命中的文字。 |
| `after` | `string` | 匹配文字之后的片段。 |
| `position` | `number` | 结果在原消息流中的位置。 |
