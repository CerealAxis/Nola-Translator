---
title: Research report（研究报告）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Research report（研究报告）

按章节逐步展示研究报告，每节附带对应来源。

研究报告是一个实时大纲：一个标题列表，用于跟踪代理的待处理、写作和完成情况，每个部分都有源计数。在运行时，这些部分会随着模型的写入而流入。独立的你已经拥有完整的列表。

<demo react="assistant-ui/research-report-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-research-report"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-research-report.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui 在模型写入工具调用的参数时将其作为部分 JSON 进行流式传输，因此报告可以是参数本身并在调用完成之前呈现。向模型询问结构化 `args` 的报告并实时阅读。

### 渲染实时参数 {#render-the-live-args}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  ResearchReport,
  type ReportSection,
} from "@/components/assistant-ui/elements/research-report";

type WriteReportArgs = {
  title: string;
  sections: ReportSection[];
  sourcesRead: number;
};

export const WriteReportToolUI: ToolCallMessagePartComponent<
  WriteReportArgs,
  void
> = ({ args }) => (
  <ResearchReport
    title={args.title ?? "Untitled report"}
    sections={args.sections ?? []}
    sourcesRead={args.sourcesRead ?? 0}
  />
);
```

   `args` 是部分解析，而调用是 `running`：`title` 可以是模型写入之前的 `undefined`，`sections` 可以比最终列表短，最后一个条目的 `preview` 可以是半写的句子。回退可以防止渲染在尚未到达的字段上中断。

### 注册工具 {#register-the-tool}

   该工具无需执行任何内容：报告是参数，而不是事后获取的内容。为模式提供与 `ReportSection` 相同的形状，以便模型自己的输出已经带有 `state`。

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { WriteReportToolUI } from "@/components/assistant-ui/elements/write-report-tool-ui";

const section = z.object({
  id: z.string(),
  heading: z.string(),
  state: z.enum(["pending", "writing", "done"]),
  sources: z.number(),
  preview: z.string().optional(),
});

export const toolkit = defineToolkit({
  write_report: {
    type: "frontend",
    description: "逐节撰写结构化研究报告。",
    parameters: z.object({
      title: z.string(),
      sections: z.array(section),
      sourcesRead: z.number(),
    }),
    execute: async () => {},
    render: WriteReportToolUI,
  },
});
```

   `execute` 不起作用；它仅在模型完成写入后才让调用完成，与任何其他前端工具相同。使用 `Tools({ toolkit })` 连接工具包；请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

在独立版中，你拥有端到端的部分列表，包括每个状态转换。

### 维护报告章节 {#hold-the-sections}

```tsx
"use client";

import { useState } from "react";
import {
  ResearchReport,
  type ReportSection,
} from "@/components/assistant-ui/elements/research-report";

const INITIAL: ReportSection[] = [
  {
    id: "intro",
    heading: "Why this matters",
    state: "done",
    sources: 3,
    preview: "Three independent benchmarks agree on the direction.",
  },
  { id: "method", heading: "How it was measured", state: "writing", sources: 1 },
  { id: "results", heading: "Results", state: "pending", sources: 0 },
];

export function Report() {
  const [sections, setSections] = useState(INITIAL);
  return (
    <ResearchReport title="采用趋势" sections={sections} sourcesRead={7} />
  );
}
```

### 更新章节状态 {#advance-a-section}

   完成一个部分并开始下一个部分是对同一数组的两次写入。

```tsx
function finishSection(id: string, preview: string) {
  setSections((prev) => {
    const i = prev.findIndex((section) => section.id === id);
    return prev.map((section, j) => {
      if (j === i) return { ...section, state: "done", preview };
      if (j === i + 1) return { ...section, state: "writing" };
      return section;
    });
  });
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="research-report">
  <div>
    <span>{title}</span>
    <span>{/* "D/T sections · S sources read" */}</span>
  </div>
  <div>
    {/* one row per section, top-bordered except the first */}
    <span>{/* check, spinner, or pending dot */}</span>
    <span>{/* heading */}</span>
    <span>{/* "N src", only when sources > 0 */}</span>
    <p>{/* preview, only when present */}</p>
  </div>
</div>
```

标头的 `done` 计数是通过过滤 `sections` 得到 `state === "done"` 来计算的。`sourcesRead` 是你提供的单独编号，并且不会与每个部分自己的 `sources` 进行交叉检查。标题亮度仅分隔 `pending`，这会使标题变暗。 `writing` 和 `done` 具有相同的明亮颜色，因此只有标题旁边的字形（旋转图标或检查符号）才能区分它们。仅当部分的源计数大于零时才会呈现。`0` 被隐藏而不是显示为 `0 src`。 `preview` 仅针对非空字符串进行渲染。显式的空字符串会隐藏它，就像省略该字段一样。第一部分的行没有顶部边框。之后的每一件事。空的 `sections` 数组单独呈现标题，读取 `0/0 sections`，没有占位符行。

## 示例 {#examples}

### 报告章节状态由模型提供 {#section-state-comes-from-the-model-not-from-assistant-ui}

**运行时版**

`state` 是模型作为 `sections` 的一部分写入的纯数据。assistant-ui 不会自行从流式传输进度推断挂起、写入或完成。如果你不想依赖模型自己的报告，`useToolArgsStatus` 将返回调用的 `status`，你可以使用它在调用完成后将每个部分强制为 `"done"`，无论模型为各个条目编写什么。

```tsx
import { useToolArgsStatus } from "@assistant-ui/react";

function useIsReportSettled() {
  const { status } = useToolArgsStatus<WriteReportArgs>();
  return status === "complete";
}
```

### 调整报告 {#restyle-the-report}

两种用法都支持通过 `className` 调整根元素。标头元行和每节源计数从共享 `mono` 标记读取，卡本身从 `paper` 读取，两者都在 `surfaces.tsx` 中。

```tsx
<ResearchReport className="max-w-none p-6" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### ResearchReport {#researchreport}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `title` | `string` |  | 报告标题。隐藏本机 `title` 属性，该属性已从转发的 props 中删除。 |
| `sections` | `readonly ReportSection[]` |  | 轮廓，按顺序排列。 |
| `sourcesRead` | `number` |  | 标题元行中显示的总源计数。独立于每个部分自己的`sources`。 |
| `className` | `string` |  | 合并到根元素。 |

### ReportSection {#reportsection}

| 字段 | 类型 | 说明 |
| --------- | ---------------------------------- | ------------------------------------------------------ |
| `id` | `string` |  |
| `heading` | `string` |  |
| `state` | `"pending" \| "writing" \| "done"` | 驱动状态字形和标题亮度。 |
| `sources` | `number` | 每个部分的引用计数。当`0`时隐藏。 |
| `preview` | `string`（可选） | 一旦它是非空字符串，就会显示在标题下。 |

其余 `div` 属性会传给根元素，除了 `title`（组件自己的属性替换）。
