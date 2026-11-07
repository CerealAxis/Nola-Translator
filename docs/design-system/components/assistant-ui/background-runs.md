---
title: Background runs（后台运行）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Background runs（后台运行）

在收件箱汇总后台运行，查看状态并进入对应会话领取结果。

<demo react="assistant-ui/background-runs-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-background-inbox"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-background-inbox.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 从会话状态生成运行列表

从会话列表和各会话运行状态构建条目，归一化为后台任务记录。

```tsx
"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import type { BackgroundRun } from "@/components/assistant-ui/elements/background-inbox";

function formatElapsed(date: Date | undefined) {
  if (!date) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

function useBackgroundRuns(): BackgroundRun[] {
  const aui = useAui();
  const threadIds = useAuiState((s) => s.threads.threadIds);

  return threadIds.map((_, index) => {
    const item = aui.threads.item({ index }).getState();
    return {
      id: item.id,
      title: item.title ?? "未命名",
      state: item.isRunning ? "running" : "ready",
      elapsed: formatElapsed(item.lastMessageAt),
    };
  });
}
```

### 渲染列表并连接切换会话

渲染 `BackgroundInbox`，把领取操作连到切换会话。已归档会话需先恢复。

```tsx
import { BackgroundInbox } from "@/components/assistant-ui/elements/background-inbox";

export function RunningElsewhere() {
  const aui = useAui();
  const runs = useBackgroundRuns();

  return (
    <BackgroundInbox
      runs={runs}
      onCollect={(id) => aui.threads.item({ id }).switchTo()}
    />
  );
}
```

**独立使用**

### 保存运行列表

由调用方持有后台运行列表。

```tsx
"use client";

import { useState } from "react";
import { BackgroundInbox, type BackgroundRun } from "@/components/assistant-ui/elements/background-inbox";

const initialRuns: BackgroundRun[] = [
  { id: "1", title: "重构身份验证模块", state: "running", elapsed: "2m" },
  { id: "2", title: "每日报告", state: "ready", elapsed: "14m", summary: "已修改 3 个文件" },
];

export function Inbox() {
  const [runs, setRuns] = useState(initialRuns);
  return <BackgroundInbox runs={runs} onCollect={(id) => openRun(id)} />;
}
```

### 更新已结束的运行

运行结束后更新状态、说明和时间。需要时开放领取操作。

```tsx
function settle(id: string, ok: boolean) {
  setRuns((prev) =>
    prev.map((run) =>
      run.id === id ? { ...run, state: ok ? "ready" : "failed" } : run,
    ),
  );
}
```

## 结构 {#anatomy}

收件箱按顺序显示运行名称、状态和可用动作。运行中、就绪和失败各有不同反馈。

```tsx
<div data-slot="background-inbox">
  <div>
    <span>后台运行</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <button>
    {/* 对应槽位内容 */}
    <span>{/* 显示加载状态 */}</span>
    <span>{/* 标题 */}</span>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 显示时间或耗时 */}</span>
  </button>
</div>
```

标题优先显示已就绪数量，否则显示运行中数量。失败项不计入两者。提供 `onCollect` 时，已就绪和失败项可点击，运行中项禁用。

## 示例 {#examples}

### 三种运行状态

同时展示运行中、已就绪和失败条目，便于区分待处理结果。

```tsx
<BackgroundInbox
  runs={[
    { id: "1", title: "重构身份验证模块", state: "running", elapsed: "2m" },
    { id: "2", title: "每日报告", state: "ready", elapsed: "14m", summary: "已修改 3 个文件" },
    { id: "3", title: "迁移数据结构", state: "failed", elapsed: "1h" },
  ]}
/>
```

### 领取已归档会话

调用取消归档后再切换到目标会话。

**使用运行时**

```tsx
onCollect={(id) => aui.threads.item({ id }).switchTo({ unarchive: true })}
```

### 调整收件箱样式

用 `className` 调整根元素布局。

```tsx
<BackgroundInbox className="max-w-md rounded-3xl" runs={runs} onCollect={onCollect} />
```

## API 参考 {#api-reference}

**使用运行时**

### 会话列表状态

| 选择器 | 类型 | 说明 |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `s.threads.threadIds` | `readonly string[]` | 会话列表中各会话的 ID。 |
| `aui.threads.item({ index }).getState()` | `ThreadListItemState` | 按索引读取会话列表项的状态。 |
| `.isRunning` | `boolean` | 指示相应的会话是否仍在运行。 |

### 客户端调用

| 调用 | 说明 |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `aui.threads.item({ id }).switchTo(options?)` | 切换到指定 ID 的会话。 |

**独立使用**

### BackgroundInbox

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `runs` | `readonly BackgroundRun[]` | 必填 | 按展示顺序排列的后台运行列表。 |
| `onCollect` | `(id: string) => void` |  | 领取结果时收到对应运行的 ID。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### BackgroundRun

| 字段 | 类型 | 说明 |
| --------- | ---------------------------------- | ------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `title` | `string` | 标题。 |
| `state` | `"running" \| "ready" \| "failed"` | 当前展示状态，决定图标及可用操作。 |
| `elapsed` | `string` | 已格式化的耗时。 |
| `summary` | `string` | 简短的结果摘要。 |

其余 `div` 属性会转发给根元素。
