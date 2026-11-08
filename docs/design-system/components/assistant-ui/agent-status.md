---
title: Agent status（代理状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Agent status（代理状态）

以状态胶囊显示代理的工作进度，运行时版可展开任务托盘。

<demo react="assistant-ui/agent-status-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**运行时版**

```bash
npx shadcn@latest add "@assistant-ui/agent-status"
```

**独立版**

```bash
npx shadcn@latest add "@assistant-ui/elements-agent-status"
```

</template>

<template #manual>

- [运行时版](https://r.assistant-ui.com/styles/new-york/agent-status.json)
- [独立版](https://r.assistant-ui.com/styles/new-york/elements-agent-status.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 显示绑定运行时的状态胶囊

在运行时中放置绑定的 `AgentStatus`，通过会话任务读取当前状态。

```tsx
"use client";

import { AgentStatus } from "@/components/assistant-ui/elements/agent-status.aui";

export function HeaderStatus() {
  return <AgentStatus />;
}
```

### 打开任务托盘

把状态触发器和 `TaskTray` 组合起来，打开后查看任务列表。

```tsx
"use client";

import { TaskTray } from "@/components/assistant-ui/elements/agent-status.aui";

export function HeaderTasks() {
  return <TaskTray />;
}
```

### 绑定单个工具调用

只跟踪一个工具调用时，传入该任务对应的 part。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { AgentStatus } from "@/components/assistant-ui/elements/agent-status";

export const toolkit = defineToolkit({
  report_status: {
    type: "backend",
    render: ({ args, status }) => (
      <AgentStatus
        state={
          status.type === "requires-action"
            ? "waiting"
            : status.type === "running"
              ? "working"
              : "done"
        }
        label={args.label}
        elapsed={args.elapsed}
      />
    ),
  },
});
```

**独立使用**

### 保存状态

独立版自行保存状态、标题和耗时。

```tsx
"use client";

import { useState } from "react";
import {
  AgentStatus,
  type AgentState,
} from "@/components/assistant-ui/elements/agent-status";

export function Status() {
  const [state, setState] = useState<AgentState>("working");
  const [label, setLabel] = useState("正在重构编辑器");
  const [elapsed, setElapsed] = useState("0:04");

  return <AgentStatus state={state} label={label} elapsed={elapsed} />;
}
```

### 推进运行状态

随着运行阶段推进更新 state。可用交互回调响应点击。

```tsx
setState("waiting");
setLabel("等待批准");
// 应用侧处理
setState("done");
setLabel("已完成，修改了两个文件");
```

## 结构 {#anatomy}

状态胶囊组合状态图标、标题和可选耗时。任务托盘提供展开后的详细视图。

```tsx
<span data-slot="agent-status">
  <span>{/* 对应槽位内容 */}</span>
  <span>{/* 显示对应状态 */}</span>
  <span>{/* 标签 */}</span>
  <span>{/* 显示时间或耗时 */}</span>
  <span aria-hidden>{/* 对应槽位内容 */}</span>
</span>
```

完成使用勾形，失败使用叉形，工作中使用脉动圆点，等待使用静态空心圆点。根元素为 `span`，状态同时作为隐藏文字提供给辅助技术。

## 示例 {#examples}

### 调整胶囊样式

使用 `className` 调整外部布局。

```tsx
<AgentStatus className="gap-3" state={state} label={label} elapsed={elapsed} />
```

### 省略耗时

不传 elapsed 即可显示不带时长的状态。

```tsx
<AgentStatus state="waiting" label="等待批准" />
```

## API 参考 {#api-reference}

**使用运行时**

### 绑定运行时的 AgentStatus 与 TaskTray

| 输入 | 类型 | 说明 |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `className` prop | `string \| undefined` | 合并到根元素的类名。 |
| 任务 | `s.thread.tasks` | 当前会话中可汇总到任务托盘的任务。 |
| `useTaskSummary()` | `TaskSummary` | 读取任务汇总状态。 |
| `summaryState(summary)` | `AgentState` | 从任务汇总推导胶囊状态。 |
| `summaryLabel(summary)` | `string` | 从任务汇总生成胶囊标签。 |

**独立使用**

### AgentStatus

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `state` | `"working" \| "waiting" \| "done" \| "failed"` | 必填 | 当前展示状态，决定图标及可用操作。 |
| `label` | `string` | 必填 | 要显示的标签。 |
| `elapsed` | `string` |  | 已格式化的耗时。 |
| `trailing` | `ReactNode` |  | 胶囊尾部的可选内容。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `span` 属性会转发给根元素。
