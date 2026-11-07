---
title: Task card（任务卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Task card（任务卡片）

折叠展示委派任务的状态、过程记录和结果。

<demo react="assistant-ui/task-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**运行时版**

```bash
npx shadcn@latest add "@assistant-ui/task-card"
```

**独立版**

```bash
npx shadcn@latest add "@assistant-ui/elements-task-card"
```

</template>

<template #manual>

- [运行时版](https://r.assistant-ui.com/styles/new-york/task-card.json)
- [独立版](https://r.assistant-ui.com/styles/new-york/elements-task-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 在会话中启用任务分组

在 Thread 中启用任务分组，让运行时根据任务的消息片段渲染 `TaskGroup`。

```tsx
"use client";

import { TaskGroup } from "@/components/assistant-ui/elements/task-card.aui";
import { Thread, type ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";

const THREAD_COMPONENTS: ThreadComponents = { TaskGroup };

export function Conversation() {
  return <Thread components={THREAD_COMPONENTS} />;
}
```

### 自行放置卡片

需要自定义位置时，可把带状态的 `TaskPart` 传给绑定运行时的 `TaskCard`。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { TaskCard } from "@/components/assistant-ui/elements/task-card.aui";

export const toolkit = defineToolkit({
  delegate: {
    type: "backend",
    render: (props) => <TaskCard part={props} />,
  },
});
```

**独立使用**

### 用状态驱动卡片

独立版传入 label、state 和可选的过程、操作与结果。传 open 与 `onOpenChange` 可自行控制展开。

```tsx
"use client";

import { useState } from "react";
import { TaskCard } from "@/components/assistant-ui/elements/task-card";

export function Task() {
  const [open, setOpen] = useState(false);

  return (
    <TaskCard
      label="审查运行时"
      meta="调研"
      state="done"
      elapsed="4.2s"
      result="已找到相关运行时路径。"
      open={open}
      onOpenChange={setOpen}
    >
      <p>已读取运行时入口。</p>
      <p>已检查会话生命周期。</p>
    </TaskCard>
  );
}
```

## 结构 {#anatomy}

标题包含状态、任务名称和耗时，展开后显示过程与结果。等待用户时可在标题下放置操作。

```tsx
<div data-slot="task-card">
  <button />
  <div data-slot="task-card-actions" />
  <div data-slot="task-card-transcript" />
  <div data-slot="task-card-result" />
</div>
<div data-slot="aui_task-group">
  <div data-slot="aui_task-group-summary" />
  <button data-slot="aui_task-group-more" />
</div>
<div data-slot="aui_task-transcript-message" />
```

只有提供 `actions` 才显示操作区。过程记录在有子内容且已展开时显示，结果可以在收起状态下显示。多任务组额外提供汇总和查看更多的入口。

## API 参考 {#api-reference}

**使用运行时**

### 绑定运行时的 TaskCard

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| `part` | `TaskPart` | 必填 | 运行时提供的任务调用片段。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### TaskGroup

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ----------------------------------------- | -------- | ------------------------------------------------------------- |
| `group` | `MessagePrimitive.GroupedParts.GroupPart` | 必填 | 条目所在的分组。 |
| `className` | `string` |  | 合并到根元素的类名。 |

**独立使用**

### TaskCard

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label` | `string` | 必填 | 要显示的标签。 |
| `meta` | `string` |  | 补充信息。 |
| `state` | `"working" \| "waiting" \| "done" \| "failed" \| "cancelled"` | 必填 | 当前展示状态，决定图标及可用操作。 |
| `elapsed` | `string` |  | 已格式化的耗时。 |
| `actions` | `ReactNode` |  | 等待用户响应时显示在标题下方的操作。 |
| `result` | `ReactNode` |  | 工具调用结果。工具尚未返回时为 undefined。 |
| `open` | `boolean` |  | 控制记录是否展开。不传时由组件自行管理。仅传 open 时禁用切换。 |
| `onOpenChange` | `(open: boolean) => void` |  | 请求更改展开状态时调用。 |
| `children` | `ReactNode` |  | 放入该组件的内容。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
