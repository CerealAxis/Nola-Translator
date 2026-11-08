---
title: Thread search（会话搜索）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Thread search（会话搜索）

在多个会话中搜索标题或摘要，并打开对应会话。

<demo react="assistant-ui/thread-search-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-thread-search"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-thread-search.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 把会话状态映射成列表

将运行时会话列表映射为可搜索条目，选择后切换到该会话。

```tsx
"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import {
  ThreadSearch,
  type SearchableThread,
} from "@/components/assistant-ui/elements/thread-search";

const DAY = 86_400_000;

function groupFor(date: Date | undefined, now: number) {
  if (!date) return "更早";
  if (date.getTime() >= now - DAY) return "今天";
  if (date.getTime() >= now - 2 * DAY) return "昨天";
  return "更早";
}

export function ThreadSearchPanel() {
  const aui = useAui();
  const items = useAuiState((s) => s.threads.threadItems);
  const openId = useAuiState((s) => s.threads.mainThreadId);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(openId);

  useLayoutEffect(() => setActiveId(openId), [openId]);

  const threads = useMemo<SearchableThread[]>(() => {
    const now = Date.now();
    return items
      .filter((item) => item.status === "regular")
      .map((item) => ({
        id: item.id,
        title: item.title ?? "新建会话",
        preview: item.isRunning ? "Running…" : "",
        group: groupFor(item.lastMessageAt, now),
        pinned: Boolean(item.custom?.["pinned"]),
      }));
  }, [items]);

  return (
    <ThreadSearch
      threads={threads}
      query={query}
      activeId={activeId}
      onQueryChange={setQuery}
      onActiveChange={setActiveId}
      onSelect={(id) => aui.threads.item({ id }).switchTo()}
    />
  );
}
```

**独立使用**

### 保存搜索状态

独立版持有查询与匹配结果，接入应用自己的打开动作。

```tsx
"use client";

import { useState } from "react";
import { ThreadSearch } from "@/components/assistant-ui/elements/thread-search";

const threads = [
  { id: "1", title: "迁移计划", group: "今天", preview: "三张表，一套回滚方案", pinned: true },
  { id: "2", title: "发行说明草稿", group: "今天", preview: "已更新 4.2 版变更日志" },
  { id: "3", title: "引导文案", group: "昨天", preview: "首次运行的三个步骤" },
];

export function History() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(threads[0]!.id);
  const [openId, setOpenId] = useState(threads[0]!.id);
  const openThread = threads.find((thread) => thread.id === openId);

  return (
    <>
      <ThreadSearch
        threads={threads}
        query={query}
        activeId={activeId}
        onQueryChange={setQuery}
        onActiveChange={setActiveId}
        onSelect={setOpenId}
      />
      <p>Open thread: {openThread?.title}</p>
    </>
  );
}
```

## 结构 {#anatomy}

搜索框下方按序显示匹配会话以及可选的摘要与时间。

```tsx
<div data-slot="thread-search">
  <div>
    <input
      role="combobox"
      aria-label="搜索会话"
      aria-expanded="true"
      aria-controls="thread-list"
      aria-activedescendant="active-thread"
      placeholder="搜索会话"
    />
  </div>
  <div id="thread-list" role="listbox" aria-label="会话">
    {/* 显示名称或标题 */}
    <div role="group" aria-label="已置顶">
      <button id="active-thread" role="option" aria-selected="true" />
    </div>
    {/* 显示名称或标题 */}
    <div role="group" aria-label="今天">
      <button role="option" aria-selected="false" />
    </div>
  </div>
  {/* 对应槽位内容 */}
  <span role="status">{/* 对应槽位内容 */}</span>
</div>
```

将标题与预览合并后匹配查询，空查询匹配全部。置顶结果优先，其余按首次命中的分组顺序显示。上下键更新高亮，回车打开会话。

## 示例 {#examples}

### 会话数据来源

可以直接使用运行时元数据，也可以从应用接口读取带摘要的会话索引。

**使用运行时**

```tsx
function togglePinned(id: string) {
  const current = aui.threads.item({ id }).getState().custom;
  aui.threads.item({ id }).updateCustom({ ...current, pinned: !current?.["pinned"] });
}
```

### 调整结果列表样式

用 `className` 调整搜索容器布局。

```tsx
<ThreadSearch className="max-w-xs" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

可通过 `useAuiState` 的选择器获取会话列表。更新使用旧版 `onSelect` 的组件时，用 `onActiveChange` 独立保存高亮 ID。方向键只改变高亮。按回车或点击条目才通过 `onSelect` 打开会话。

### 会话列表状态

| 选择器 | 类型 | 说明 |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `s.threads.threadItems` | `readonly ThreadListItemState[]` | 会话列表项的元数据。 |
| `s.threads.mainThreadId` | `string` | 当前会话的 ID。 |
| `aui.threads.item({ id }).switchTo(options)` | `{ unarchive?: boolean }` | 切换到指定 ID 的会话。 |
| `aui.threads.item({ id }).updateCustom(custom)` | `Record<string, unknown> \| undefined` | 更新该会话的自定义元数据。 |

**独立使用**

### ThreadSearch

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threads` | `readonly SearchableThread[]` | 必填 | 待搜索的会话列表。 |
| `query` | `string` | 必填 | 当前搜索内容。 |
| `activeId` | `string` | 必填 | 当前高亮条目的 ID。 |
| `onQueryChange` | `(query: string) => void` |  | 搜索内容改变时调用。 |
| `onActiveChange` | `(id: string) => void` | required with `onSelect` | 高亮条目变化时调用。 |
| `onSelect` | `(id: string) => void` |  | 用户选中条目时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### SearchableThread

| 字段 | 类型 | 说明 |
| --------- | --------- | ------------------------------------------------------------------------------ |
| `id` | `string` | 条目的稳定标识。 |
| `title` | `string` | 标题。 |
| `group` | `string` | 条目所在的分组。 |
| `preview` | `string` | 会话内容预览。 |
| `pinned` | `boolean` | 会话是否置顶。 |
