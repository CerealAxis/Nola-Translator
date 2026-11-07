---
title: Todo list（待办列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Todo list（待办列表）

以清单形式显示待办任务、当前步骤及其完成情况。

<demo react="assistant-ui/todo-list-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-todo-list"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-todo-list.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 定义待办工具

定义包含 items 等参数的待办工具，并把工具的流式参数传给 `TodoList`。

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { TodoList } from "@/components/assistant-ui/elements/todo-list";

export const toolkit = defineToolkit({
  update_todos: {
    type: "frontend",
    description: "用当前计划更新显示中的待办列表。",
    parameters: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      maxVisible: z.number().optional(),
      items: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          description: z.string().optional(),
          status: z.enum(["pending", "active", "done", "failed", "cancelled"]),
          reason: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ items }) => ({ count: items.length }),
    render: ({ args }) => (
      <TodoList
        title={args.title}
        description={args.description}
        maxVisible={args.maxVisible}
        items={args.items ?? []}
      />
    ),
  },
});
```

创建工具可参阅 [定义工具](https://www.assistant-ui.com/docs/tools/defining-tools)。

### 注册工具包

用 `defineToolkit` 注册工具。display 可设为 "standalone"，把清单放到思考轨迹之外。

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存待办状态

在应用状态保存待办数组，保持条目的 id 稳定。

```tsx
"use client";

import { useState } from "react";
import { TodoList, type TodoItem } from "@/components/assistant-ui/elements/todo-list";

const initialItems: TodoItem[] = [
  { id: "1", text: "查看失败的测试", description: "追踪当前行为。", status: "done" },
  { id: "2", text: "在本地复现", status: "active" },
  { id: "3", text: "编写修复", status: "pending" },
  { id: "4", text: "重新运行测试", status: "failed", reason: "测试超时" },
  { id: "5", text: "更新旧测试夹具", status: "cancelled" },
];

export function Plan() {
  const [items, setItems] = useState(initialItems);
  return <TodoList items={items} />;
}
```

### 更新条目状态

更新目标条目的 status。失败原因用 reason，必要时递增 revision 显示修订。

```tsx
function advance(id: string) {
  setItems((prev) =>
    prev.map((item) =>
      item.id === id
        ? { ...item, status: item.status === "pending" ? "active" : "done" }
        : item,
    ),
  );
}
```

## 结构 {#anatomy}

标题和计数位于列表上方，每行显示图标、任务名和可选详情。只有 done 计入已完成，cancelled 不参与计数。

```tsx
<div data-slot="todo-list">
  <div>
    <div>
      <span>待办事项</span>
      <p>{/* 显示条目列表 */}</p>
    </div>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <ul>
    <li data-status="pending | active | done | failed | cancelled">
      <span>{/* 显示加载状态 */}</span>
      <span>{/* 显示对应状态 */}</span>
      <div>
        <span>{/* 对应槽位内容 */}</span>
        <p>{/* 对应槽位内容 */}</p>
      </div>
    </li>
    {/* 逐项渲染 */}
  </ul>
  <button aria-expanded="false">再显示 N 项</button>
</div>
```

每行通过隐藏文字播报任务状态。待处理、进行中和已完成项可显示说明，失败项改用 `reason`，取消项从进度统计中剔除。

## 示例 {#examples}

### 条目状态

支持 pending、active、done、failed 和 cancelled，失败状态可显示 reason。

```tsx
<TodoList
  items={[
    { id: "1", text: "查看失败的测试", status: "done" },
    { id: "2", text: "在本地复现", status: "active" },
    { id: "3", text: "编写修复", status: "pending" },
    { id: "4", text: "运行部署", status: "failed", reason: "已超时" },
    { id: "5", text: "替换旧测试夹具", status: "cancelled" },
  ]}
/>
```

### 折叠长列表

使用 `maxVisible` 折叠超出的普通条目。后面的执行中或失败任务仍可见。

```tsx
<TodoList
  maxVisible={3}
  items={[
    { id: "1", text: "查看失败的测试", status: "done" },
    { id: "2", text: "在本地复现", status: "done" },
    { id: "3", text: "编写修复", status: "pending" },
    { id: "4", text: "运行类型检查", status: "active" },
    { id: "5", text: "运行单元测试", status: "failed", reason: "已超时" },
    { id: "6", text: "更新变更日志", status: "pending" },
    { id: "7", text: "发布", status: "pending" },
  ]}
/>
```

### 清单数据来源

运行时接收工具参数。独立版从任务状态生成数组。

**使用运行时**

```tsx
import { useToolArgsStatus } from "@assistant-ui/react";

function TodoToolUI({ args }: { args: { items?: TodoItem[] } }) {
  const { propStatus } = useToolArgsStatus<{ items: TodoItem[] }>();
  return (
    <TodoList
      items={args.items ?? []}
      className={propStatus.items === "streaming" ? "opacity-70" : undefined}
    />
  );
}
```

**独立使用**

```tsx
function addItem(text: string) {
  setItems((prev) => [
    ...prev,
    { id: crypto.randomUUID(), text, status: "pending" },
  ]);
}
```

### 调整清单样式

用 `className` 调整根元素。

```tsx
<TodoList className="max-w-md gap-2" items={items} revision={3} />
```

## API 参考 {#api-reference}

**使用运行时**

### 工具定义

| 字段 | 类型 | 说明 |
| ------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `parameters` | Zod 模式 | 工具参数的 Zod 模式。 |
| `execute` | `(args) => TResult \| Promise<TResult>` | 在调用解析完成后执行工具。 |
| `render` | `ToolCallMessagePartComponent<TArgs, TResult>` | 接收工具参数、状态和结果的渲染函数。 |
| `display` | `"standalone" \| "inline"` | 决定工具 UI 在思考轨迹中显示，还是单独显示。 |

### 待办工具参数

| 字段 | 类型 | 说明 |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `items` | `TodoItem[]` | 按顺序渲染的条目。 |
| `title` | `string` | 标题。 |
| `description` | `string` | 补充说明。 |
| `maxVisible` | `number` | 折叠前显示的条目数量。后面的执行中和失败条目仍然可见。 |

### 工具调用片段状态

| 字段 | 类型 | 说明 |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `part.status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | 工具调用片段所处的生命周期阶段。 |
| `useToolArgsStatus().propStatus` | `Partial<Record<keyof TArgs, "streaming" \| "complete">>` | 在渲染器中读取各工具参数的流式生成状态。 |

**独立使用**

### TodoList

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | --------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `items` | `readonly TodoItem[]` | 必填 | 按顺序渲染的条目。 |
| `revision` | `number` |  | 可选的修订号，附在计数后。 |
| `title` | `string` | `"Todos"` | 标题。 |
| `description` | `string` |  | 补充说明。 |
| `maxVisible` | `number` |  | 折叠前显示的条目数量。后面的执行中和失败条目仍然可见。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### TodoItem

| 字段 | 类型 | 说明 |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id` | `string` | 条目的稳定标识。 |
| `text` | `string` | 正文或条目的可见标签。 |
| `status` | `"pending" \| "active" \| "done" \| "failed" \| "cancelled"` | 决定任务图标和文字样式。只有 done 计入已完成。cancelled 不计入总数。 |
| `description` | `string` | 补充说明。 |
| `reason` | `string` | 失败时显示的说明，优先于 description。 |
