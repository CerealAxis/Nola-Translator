---
title: Checkpoints（检查点）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Checkpoints（检查点）

列出执行中的检查点，显示当前位置并支持恢复。

<demo react="assistant-ui/checkpoints-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-checkpoint-history"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-checkpoint-history.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**独立使用**

### 渲染列表与当前检查点

把 checkpoints 和 `currentId` 传给列表，标明当前检查点。

```tsx
"use client";

import { CheckpointHistory, type Checkpoint } from "@/components/assistant-ui/elements/checkpoint-history";

const checkpoints: Checkpoint[] = [
  { id: "1", label: "初始脚手架", at: "10:02", files: 4 },
  { id: "2", label: "已添加身份验证", at: "10:19", files: 7 },
  { id: "3", label: "已修复布局问题", at: "10:41", files: 2 },
];

export function History() {
  return <CheckpointHistory checkpoints={checkpoints} currentId="3" />;
}
```

### 点击恢复

在 `onRestore` 中恢复相应快照。成功后同步更新 `currentId`。

```tsx
"use client";

import { useState } from "react";

export function History() {
  const [currentId, setCurrentId] = useState("3");

  return (
    <CheckpointHistory
      checkpoints={checkpoints}
      currentId={currentId}
      onRestore={(id) => {
        rollBackTo(id);
        setCurrentId(id);
      }}
    />
  );
}
```

## 结构 {#anatomy}

组件按时间顺序显示快照，区分之前、当前和之后的位置，并在可恢复项提供操作。

```tsx
<div data-slot="checkpoint-history">
  <span>检查点</span>
  <div>
    {/* 逐项渲染 */}
    <span>{/* 对应槽位内容 */}</span>
    <span>{label}</span>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 操作控件 */}</span>
  </div>
</div>
```

列表通过 `currentId` 匹配当前位置。数组中位置更靠后的行用空心圆点和降低的不透明度表示。当前行显示当前标记，其余行可提供恢复操作。

## 示例 {#examples}

### 当前之后的检查点

列表仍显示较新的检查点，可用来查看时间线。

```tsx
<CheckpointHistory checkpoints={checkpoints} currentId="2" onRestore={onRestore} />
```

### 当前 ID 无法识别

如果 `currentId` 不匹配已有记录，列表不会将任何条目标为当前。

```tsx
<CheckpointHistory checkpoints={checkpoints} currentId="" onRestore={onRestore} />
```

### 调整列表样式

通过 `className` 调整根元素。

```tsx
<CheckpointHistory className="max-w-md rounded-3xl" {...rest} />
```

## API 参考 {#api-reference}

**独立使用**

### CheckpointHistory

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `checkpoints` | `readonly Checkpoint[]` | 必填 | 要显示的检查点列表。 |
| `currentId` | `string` | 必填 | 当前检查点的 ID。 |
| `onRestore` | `(id: string) => void` |  | 选择恢复时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### Checkpoint

| 字段 | 类型 | 说明 |
| ------- | -------- | --------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `label` | `string` | 要显示的标签。 |
| `at` | `string` | 可读的日期或时间。 |
| `files` | `number` | 检查点涉及的文件。 |

其余 `div` 属性会转发给根元素。
