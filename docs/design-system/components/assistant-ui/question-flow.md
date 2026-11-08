---
title: Question flow（问答流程）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Question flow（问答流程）

按步骤收集多个问题的答案，最后一次性提交。

<demo react="assistant-ui/question-flow-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-question-flow"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-question-flow.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染人工参与工具

将工具参数中的 steps 传给组件。只有会话允许 `answerToolCall` 时才提供 `onComplete`。

```tsx
"use client";

import { defineToolkit, useAuiState } from "@assistant-ui/react";
import { z } from "zod";
import { QuestionFlow } from "@/components/assistant-ui/elements/question-flow";

export const toolkit = defineToolkit({
  ask_project_questions: {
    type: "human",
    description: "规划项目更新前，先提几个简短的问题。",
    parameters: z.object({
      steps: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          description: z.string().optional(),
          options: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              description: z.string().optional(),
            }),
          ),
          selectionMode: z.enum(["single", "multiple"]).optional(),
          minSelections: z.number().optional(),
          maxSelections: z.number().optional(),
        }),
      ),
    }),
    render: function AskProjectQuestions({ args, status, result, addResult }) {
      const canAnswer = useAuiState(
        (s) => s.thread.capabilities.answerToolCall,
      );
      const waiting = status.type === "requires-action" && canAnswer;

      return (
        <QuestionFlow
          steps={args.steps ?? []}
          choice={result?.answers}
          onComplete={
            waiting ? (answers) => addResult({ answers }) : undefined
          }
        />
      );
    },
  },
});
```

将完整答案交还给工具的方式可参阅 [收集用户输入](https://www.assistant-ui.com/docs/tools/tool-ui#user-input-collection)。

### 注册工具包

注册 human tool，在最后一步通过 `addResult`({ answers }) 提交完整答案。

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { toolkit } from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存完整答案

以题目 ID 为键保存选项 ID 数组。通过 `defaultValue` 为各步骤提供初始答案。

```tsx
"use client";

import { useState } from "react";
import {
  QuestionFlow,
  type QuestionFlowStep,
} from "@/components/assistant-ui/elements/question-flow";

const STEPS: QuestionFlowStep[] = [
  {
    id: "audience",
    question: "谁需要收到这次更新？",
    options: [
      { id: "team", label: "项目团队" },
      { id: "leaders", label: "部门负责人" },
    ],
  },
  {
    id: "topics",
    question: "更新应包含哪些内容？",
    selectionMode: "multiple",
    options: [
      { id: "milestones", label: "里程碑" },
      { id: "risks", label: "待处理风险" },
    ],
  },
];

export function ProjectUpdateQuestions() {
  const [choice, setChoice] = useState<Record<string, string[]>>();

  return (
    <QuestionFlow
      steps={STEPS}
      choice={choice}
      onComplete={setChoice}
    />
  );
}
```

### 异步完成

在 `onComplete` 返回 Promise 处理异步保存。成功后显示回执，也可传入 choice 恢复已有回执。

```tsx
<QuestionFlow
  steps={STEPS}
  onComplete={async (answers) => {
    await saveProjectUpdateAnswers(answers);
    setChoice(answers);
  }}
/>
```

## 结构 {#anatomy}

组件显示当前步骤、进度和选项列表，结束后按题目汇总答案。

```tsx
<div data-slot="question-flow" data-state="open | receipt">
  <div>
    <span />
    <button type="button" />
  </div>
  <div role="progressbar" />
  <p />
  <div data-slot="option-list" />
</div>
```

单选立即前进，多选在中间步骤使用下一步，最后一步使用提交。返回时保留之前的答案。切换步骤后，焦点移到第一个可用选项。

## 示例 {#examples}

### 带已有答案开始

`defaultValue` 以步骤 ID 为键，值为选项 ID 数组。不存在的选项 ID 会被忽略。

```tsx
<QuestionFlow
  steps={STEPS}
  defaultValue={{ audience: ["team"], topics: ["milestones"] }}
  onComplete={saveAnswers}
/>
```

### 修改最终操作文案

通过 `completeLabel` 调整最终多选确认按钮的文案。

```tsx
<QuestionFlow
  steps={STEPS}
  completeLabel="创建更新"
  onComplete={saveAnswers}
/>
```

## API 参考 {#api-reference}

**使用运行时**

### 人工参与工具渲染属性

| 属性 | 类型 | 说明 |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `args.steps` | `QuestionFlowStep[]` | 按执行或展示顺序排列的步骤。 |
| `status` | `ToolCallMessagePartStatus` | 当前状态。工具等待用户操作时，status.type 为 requires-action。 |
| `result` | `{ answers: Record<string, string[]> } \| undefined` | 工具调用结果。工具尚未返回时为 undefined。 |
| `addResult` | `(result) => void` | 提交结果并完成工具调用。 |
| `s.thread.capabilities.answerToolCall` | `boolean` | 当前会话是否可回答工具调用。只读会话不显示操作。 |

**独立使用**

### QuestionFlow

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `steps` | `QuestionFlowStep[]` | 必填 | 按执行或展示顺序排列的步骤。 |
| `defaultValue` | `Record<string, string[]>` |  | 初始化时使用的选项或答案。 |
| `onComplete` | `(answers) => void \| Promise<void>` |  | 最后一步提交完整答案时调用。 |
| `completeLabel` | `string` | `"Submit"` | 最后一步的提交按钮文字。 |
| `choice` | `Record<string, string[]>` |  | 已经提交的答案。传入时优先显示回执。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
