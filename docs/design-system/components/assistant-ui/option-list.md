---
title: Option list（选项列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Option list（选项列表）

让用户从工具提出的选项中单选或多选，确认后显示答案。

<demo react="assistant-ui/option-list-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-option-list"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-option-list.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染工具调用

渲染工具参数中的 options 和 `selectionMode`。等待用户输入时开放确认，通过 `addResult` 写入 selected。

```tsx
"use client";

import { defineToolkit, useAuiState } from "@assistant-ui/react";
import { z } from "zod";
import { OptionList } from "@/components/assistant-ui/elements/option-list";

export const toolkit = defineToolkit({
  ask_user_to_choose: {
    type: "human",
    description:
      "提出一个带备选答案的问题。问题放在消息正文里，选项只包含答案。",
    parameters: z.object({
      options: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
        }),
      ),
      selectionMode: z.enum(["single", "multiple"]).optional(),
    }),
    render: function AskUserToChoose({ args, status, result, addResult }) {
      const canAnswer = useAuiState(
        (s) => s.thread.capabilities.answerToolCall,
      );
      const waiting = status.type === "requires-action" && canAnswer;

      return (
        <OptionList
          options={args.options ?? []}
          selectionMode={args.selectionMode}
          choice={result?.selected}
          onConfirm={
            waiting ? (ids) => addResult({ selected: ids }) : undefined
          }
        />
      );
    },
  },
});
```

将选择交还给工具的方式可参阅 [收集用户输入](https://www.assistant-ui.com/docs/tools/tool-ui#user-input-collection)。

### 注册工具包

将工具包注册到运行时，消息列表在对应工具调用处渲染选项。

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

### 保存答案

由调用方保存已提交的 ID。传 choice 可直接显示回执。

```tsx
"use client";

import { useState } from "react";
import { OptionList } from "@/components/assistant-ui/elements/option-list";

const OPTIONS = [
  { id: "merge", label: "合并重复项" },
  { id: "keep", label: "保留两条" },
  { id: "review", label: "逐对检查" },
];

export function Duplicates() {
  const [choice, setChoice] = useState<string[]>();

  return (
    <OptionList
      aria-label="如何处理重复联系人？"
      options={OPTIONS}
      choice={choice}
      onConfirm={setChoice}
    />
  );
}
```

### 异步提交

`onConfirm` 可返回 Promise，成功后显示回执。多选通过确认按钮提交。

```tsx
<OptionList
  options={OPTIONS}
  choice={choice}
  onConfirm={async (ids) => {
    await saveAnswer(ids);
    setChoice(ids);
  }}
/>
```

## 结构 {#anatomy}

列表按顺序渲染选项及可选说明。单选点击即提交，多选使用复选状态与确认按钮。

```tsx
<div data-slot="option-list" data-state="open | pending | receipt">
  {/* 逐项渲染 */}
  {/* 根据选择模式显示交互控件 */}
</div>
```

没有 `onConfirm` 时仅展示选项。传入 `choice` 后只显示选中的条目并禁用输入。空数组表示未选择任何选项。

## 示例 {#examples}

### 选择多个答案

设置 `selectionMode`="multiple"，用 `minSelections` 和 `maxSelections` 约束数量。

```tsx
<OptionList
  aria-label="部署前应运行哪些检查？"
  selectionMode="multiple"
  defaultValue={["typecheck", "unit"]}
  maxSelections={3}
  options={CHECKS}
  onConfirm={setChoice}
/>
```

### 标明问题

在列表上方放置可见题目，并使用带标签的外层分组提供可访问名称。

## API 参考 {#api-reference}

**使用运行时**

### 工具调用渲染属性

| 属性 | 类型 | 说明 |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `args` | `{ options: OptionListOption[]; selectionMode?: "single" \| "multiple" }` | 工具调用参数。流式调用尚未结束时，内容可能只解析了一部分。 |
| `status` | `ToolCallMessagePartStatus` | 当前状态。工具等待用户操作时，status.type 为 requires-action。 |
| `result` | `{ selected: string[] } \| undefined` | 工具调用结果。工具尚未返回时为 undefined。 |
| `addResult` | `(result) => void` | 提交结果并完成工具调用。 |

完整的渲染属性请参阅 [工具界面](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立使用**

### OptionList

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | `readonly OptionListOption[]` | 必填 | 按展示顺序提供的选项。 |
| `selectionMode` | `"single" \| "multiple"` | `"single"` | 选择模式。单选立即提交，多选经确认后提交。 |
| `defaultValue` | `readonly string[]` |  | 初始化时使用的选项或答案。 |
| `minSelections` | `number` | `1` | 多选确认需要达到的最小数量。 |
| `maxSelections` | `number` | `options.length` | 多选允许选择的最大数量。 |
| `onConfirm` | `(ids: string[]) => void \| Promise<void>` |  | 确认选择时调用。返回的 Promise 成功后显示回执。 |
| `confirmLabel` | `string` | `"Confirm"` | 多选确认按钮的文字。 |
| `choice` | `string[]` |  | 已经提交的答案。传入时优先显示回执。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
