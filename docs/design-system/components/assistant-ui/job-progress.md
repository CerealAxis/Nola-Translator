---
title: Job progress（任务进度）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Job progress（任务进度）

跟踪分阶段任务的实时进度，并在结束后显示结果回执。

<demo react="assistant-ui/job-progress-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-job-progress"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-job-progress.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 显示实时任务及回执

渲染器用 `args.stages` 建立任务阶段，运行中传入当前阶段、阶段内进度和预计时间。工具返回 outcome 后切换为结果回执。

```tsx
"use client";

import { defineToolkit } from "@assistant-ui/react";
import { JobProgress } from "@/components/assistant-ui/elements/job-progress";

export const toolkit = defineToolkit({
  run_ci_job: {
    type: "backend",
    render: ({ args, result, addResult }) => {
      if (!result) {
        return (
          <JobProgress
            title={args.target}
            stages={args.stages ?? []}
            stageIndex={0}
            stageProgress={0}
            eta="starting"
            onCancel={() =>
              addResult({
                stageIndex: 0,
                stageProgress: 0,
                eta: "cancelled",
                outcome: {
                  status: "cancelled",
                  summary: "已在 CI 启动前取消。",
                },
                elapsedMs: 0,
              })
            }
          />
        );
      }

      return (
        <JobProgress
          title={args.target}
          stages={args.stages ?? []}
          stageIndex={result.stageIndex}
          stageProgress={result.stageProgress}
          eta={result.eta}
          outcome={result.outcome}
          elapsedMs={result.elapsedMs}
        />
      );
    },
  },
});
```

**独立使用**

### 传入运行快照

传入 stages、`stageIndex`、`stageProgress` 和 eta。需要取消时提供 `onCancel`。

```tsx
"use client";

import {
  JobProgress,
  type JobStage,
} from "@/components/assistant-ui/elements/job-progress";

const stages: readonly JobStage[] = [
  { name: "clone", weight: 1, description: "正在拉取分支" },
  { name: "install", weight: 4, description: "正在恢复依赖" },
  { name: "build", weight: 3, description: "正在编译软件包" },
  { name: "test", weight: 2, description: "正在运行测试套件" },
];

export function CiJob() {
  return (
    <JobProgress
      title="在 CI 中验证修复"
      stages={stages}
      stageIndex={1}
      stageProgress={0.6}
      eta="about 3 min"
    />
  );
}
```

### 用执行结果生成回执

从执行结果传入 outcome 和 `elapsedMs`。未传 outcome 时，`stageIndex` 达到阶段数表示成功结束。

```tsx
<JobProgress
  title="在 CI 中验证修复"
  stages={stages}
  stageIndex={3}
  stageProgress={0.4}
  eta="stopped"
  outcome={{
    status: "partial",
    summary: "构建已通过，预览环境超时后测试停止。",
  }}
  elapsedMs={72_000}
/>
```

## 结构 {#anatomy}

进度条按阶段权重汇总。运行时显示当前阶段说明和预计时间，结束时显示状态、耗时和可选摘要。

```tsx
<div data-slot="job-progress" data-state="running">
  <div>
    <span>状态图标</span>
    <span>title</span>
    <span>ETA, status word, or elapsed time</span>
    <button>cancel</button>
  </div>

  <span role="progressbar">weighted progress or a completed receipt</span>

  <div>
    <div>one monospace label per stage</div>
    <p>the current stage description</p>
  </div>

  <p>optional outcome summary</p>
  <span role="status">current stage or final outcome</span>
</div>
```

`stageProgress` 只计入当前阶段的权重。辅助技术可通过状态区域获知阶段变化和最终结果。指定 `outcome` 时，以回执为准。

## 示例 {#examples}

### 部分完成回执

把 `outcome.status` 设为 "partial"，再用 summary 写明完成的部分和需要跟进的内容。

```tsx
<JobProgress
  title="在 CI 中验证修复"
  stages={stages}
  stageIndex={3}
  stageProgress={0.4}
  eta="stopped"
  outcome={{
    status: "partial",
    summary: "构建已通过，预览环境超时后测试停止。",
  }}
  elapsedMs={72_000}
/>
```

### 调整根元素样式

使用 `className` 调整组件所在区域的布局。

```tsx
<JobProgress
  title="在 CI 中验证修复"
  stages={stages}
  stageIndex={1}
  stageProgress={0.6}
  eta="about 3 min"
  className="max-w-none gap-4"
/>
```

## API 参考 {#api-reference}

**使用运行时**

### 渲染属性

| 属性 | 类型 | 说明 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `args` | `{ target: string; stages: { name: string; weight: number; description?: string }[] }` | 工具参数。任务仍在运行时即可从参数读取阶段列表。 |
| `result` | `{ stageIndex: number; stageProgress: number; eta: string; outcome?: { status: "success" \| "partial" \| "failed" \| "cancelled"; summary?: string }; elapsedMs?: number } \| undefined` | 执行器最后一次返回的结果。提供 outcome 时，卡片切换到回执。 |
| `addResult` | `(result: TResult) => void` | 提交结果并完成工具调用。 |

### run_ci_job 结果

| 字段 | 类型 | 说明 |
| --------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `stageIndex` | `number` | 当前阶段的索引。达到阶段数表示已跑完。 |
| `stageProgress` | `number` | 阶段内进度，范围 0 到 1。 |
| `eta` | `string` | 运行中显示的预计时间。 |
| `outcome` | `{ status: "success" \| "partial" \| "failed" \| "cancelled"; summary?: string }` | 任务结束时展示的状态和可选摘要。 |
| `elapsedMs` | `number` | 耗时，单位为毫秒。 |

### 运行时结果字段

| 字段 | 类型 | 说明 |
| --------- | --------------------------------------------------- | ------------------------------------- |
| `status` | `"success" \| "partial" \| "failed" \| "cancelled"` | 最终回执状态，可为成功、部分成功、失败或已取消。 |
| `summary` | `string` | 简短的结果摘要。 |

**独立使用**

### JobProgress

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `title` | `string` | 必填 | 标题。 |
| `stages` | `readonly JobStage[]` | 必填 | 按顺序排列的任务阶段。各阶段可指定权重和说明。 |
| `stageIndex` | `number` | 必填 | 当前阶段的索引。达到阶段数表示已跑完。 |
| `stageProgress` | `number` | 必填 | 阶段内进度，范围 0 到 1。 |
| `eta` | `string` | 必填 | 运行中显示的预计时间。 |
| `onCancel` | `() => void` |  | 用户取消运行时调用。 |
| `outcome` | `{ status: "success" \| "partial" \| "failed" \| "cancelled"; summary?: string }` |  | 任务结束时展示的状态和可选摘要。 |
| `elapsedMs` | `number` |  | 耗时，单位为毫秒。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### JobStage

| 字段 | 类型 | 说明 |
| ------------- | -------- | -------------------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `weight` | `number` | 该阶段在总进度中的相对占比。 |
| `description` | `string` | 补充说明。 |

### 独立版结果字段

| 字段 | 类型 | 说明 |
| --------- | --------------------------------------------------- | ------------------------------------- |
| `status` | `"success" \| "partial" \| "failed" \| "cancelled"` | 最终回执状态，可为成功、部分成功、失败或已取消。 |
| `summary` | `string` | 简短的结果摘要。 |
