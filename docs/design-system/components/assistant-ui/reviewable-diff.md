---
title: Reviewable diff（可审阅差异）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Reviewable diff（可审阅差异）

逐块审阅代码差异，决定保留或舍弃，再应用选中的改动。

差异审阅组件将补丁分成多个块，并要求每个块做出决定：保留它还是丢弃它，并带有一个运行计数和一个应用按钮，该按钮将保持禁用状态，直到每个块都有答案。对于运行时来说，这是一个人工工具：模型提出差异块并暂停以做出决定。独立版由调用方提供差异块并管理审阅决定。

<demo react="assistant-ui/reviewable-diff-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-reviewable-diff"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-reviewable-diff.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

补丁审阅没有自动结果，因此它注册为人工工具：没有 `execute`，并且只有在渲染器调用 `addResult` 后调用才会解析。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  ReviewableDiff,
  type DiffHunk,
  type HunkDecision,
} from "@/components/assistant-ui/elements/reviewable-diff";

type ReviewPatchArgs = {
  filename: string;
  hunks: readonly Omit<DiffHunk, "decision">[];
};
type ReviewPatchResult = { kept: readonly string[] };

export const ReviewPatchToolUI: ToolCallMessagePartComponent<
  ReviewPatchArgs,
  ReviewPatchResult
> = ({ args, status, result, addResult }) => {
  const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});

  if (status.type === "running" || status.type === "incomplete") return null;

  if (result) {
    return (
      <p>
        应用 {result.kept.length} 的 {args.hunks.length} 猛男 {args.filename}.
      </p>
    );
  }

  const hunks: DiffHunk[] = args.hunks.map((hunk) => ({
    ...hunk,
    decision: decisions[hunk.id] ?? "pending",
  }));

  return (
    <ReviewableDiff
      filename={args.filename}
      hunks={hunks}
      onKeep={(id) => setDecisions((d) => ({ ...d, [id]: "kept" }))}
      onDiscard={(id) => setDecisions((d) => ({ ...d, [id]: "discarded" }))}
      onApply={() =>
        addResult({
          kept: hunks.filter((h) => h.decision === "kept").map((h) => h.id),
        })
      }
    />
  );
};
```

   `args` 是部分解析，而调用是 `running`，因此渲染器在读取 `hunks` 之前等待完整的参数。

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { ReviewPatchToolUI } from "@/components/assistant-ui/elements/review-patch-tool-ui";

export const toolkit = defineToolkit({
  review_patch: {
    type: "human",
    description: "询问用户要保留建议补丁的哪些部分。",
    parameters: z.object({
      filename: z.string(),
      hunks: z.array(
        z.object({
          id: z.string(),
          range: z.string(),
          lines: z.array(
            z.object({
              kind: z.enum(["context", "added", "removed"]),
              text: z.string(),
            }),
          ),
        }),
      ),
    }),
    render: ReviewPatchToolUI,
  },
});
```

```tsx
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

   有关人工工具和 `addResult` 的更多信息，请参阅[收集用户输入](https://www.assistant-ui.com/docs/tools/tool-ui#user-input-collection)]。

**独立版**

在独立版中，你掌握着差异块和他们的决定，一旦每个差异块做出决定，`onApply` 就会运行你选择的任何内容。

### 维护审核决定 {#hold-the-decisions}

```tsx
"use client";

import { useState } from "react";
import {
  ReviewableDiff,
  type DiffHunk,
  type HunkDecision,
} from "@/components/assistant-ui/elements/reviewable-diff";

const HUNKS: readonly Omit<DiffHunk, "decision">[] = [
  {
    id: "h1",
    range: "@@ -12,6 +12,7",
    lines: [
      { kind: "context", text: "  const composer = useComposer();" },
      { kind: "removed", text: "  const [草稿，setDraft] = useState(\"\");" },
      { kind: "added", text: "  const draft = useDraft(threadId);" },
    ],
  },
];

export function PatchReview() {
  const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});
  const hunks: DiffHunk[] = HUNKS.map((hunk) => ({
    ...hunk,
    decision: decisions[hunk.id] ?? "pending",
  }));

  return (
    <ReviewableDiff
      filename="composer.tsx"
      hunks={hunks}
      onKeep={(id) => setDecisions((d) => ({ ...d, [id]: "kept" }))}
      onDiscard={(id) => setDecisions((d) => ({ ...d, [id]: "discarded" }))}
      onApply={() => applyPatch(hunks.filter((h) => h.decision === "kept"))}
    />
  );
}
```

### 应用保留的差异块 {#apply-the-kept-hunks}

   `onApply` 不带任何参数，因此从你自己的状态读取每个块的当前 `decision` 。该元素不会提交或清除任何内容，因此处理程序会执行以下两项操作：

```tsx
async function applyPatch(kept: readonly DiffHunk[]) {
  await fetch("/api/patch", {
    method: "POST",
    body: JSON.stringify({ hunkIds: kept.map((h) => h.id) }),
  });
  setDecisions({});
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="reviewable-diff">
  <div>{/* filename, "N of M kept" */}</div>
  <div>
    {/* one block per hunk: range, then Discard/Keep while pending, else the decision label; the diff lines dim once discarded but stay visible */}
  </div>
  <div>
    {/* "N left to review" or "All reviewed"; with onApply, an Apply button disabled while any hunk is pending */}
  </div>
</div>
```

`kept` 和 `pending` 始终通过计算 `hunks` 来派生，从不单独存储，因此页眉和页脚与你传入的任何 `decision` 值保持同步。`onKeep`、`onDiscard` 和 `onApply` 都是可选的：仅传递你需要的值，每个匹配的控件仅在提供其处理程序时呈现。

## 示例 {#examples}

### 调整审核视图样式 {#restyle-the-review}

两种用法都支持通过 `className` 调整根元素。卡面来自`paper`，Apply按钮来自`inkButton`，两者都在`surfaces.tsx`。

```tsx
<ReviewableDiff className="max-w-none" /* ... */ />
```

### 没有待审核的变更 {#nothing-to-review}

空的 `hunks` 数组是有效的：标题读取“0 of 0 returned”，页脚读取“All review”，因为没有任何待处理的内容。如果提供了 `onApply`，Apply 将读取“Apply 0”并保持启用状态。否则该按钮将被省略。

```tsx
<ReviewableDiff filename="composer.tsx" hunks={[]} />
```

### 一次丢弃全部差异块 {#discard-everything-at-once}

两种用法都将 `decisions` 保存为本地状态，因此无论该状态存在于何处，拒绝所有控制都是同一行：

```tsx
function discardAll() {
  setDecisions(Object.fromEntries(hunks.map((h) => [h.id, "discarded"])));
}
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args` | `{ filename: string; hunks: readonly Omit<DiffHunk, "decision">[] }` | 该模型提议的文件名和未经审查的差异块。 |
| `result` | `{ kept: readonly string[] } \| undefined` | 一旦 `addResult` 被调用就置位。用户保留的差异块 ID。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 在参数流入时为 `"running"`，在调用被缩短时为 `"incomplete"`。两者的论点都可以是部分的。 |
| `addResult` | `(result: ReviewPatchResult) => void` | 在用户决定好每个人后，调用一次，解决调用。 |

请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表和人工工具注册。

**独立版**

### ReviewableDiff {#reviewablediff}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `filename` | `string` |  | 显示在标题中。 |
| `hunks` | `readonly DiffHunk[]` |  | 差异块按顺序每个人都携带着自己的 `decision`。 |
| `onKeep` | `(id: string) => void` |  | 当按下待处理块的保留按钮时调用。仅当提供时才保持按钮呈现。 |
| `onDiscard` | `(id: string) => void` |  | 当按下待处理块的放弃按钮时调用。仅当提供此选项时才丢弃按钮呈现。 |
| `onApply` | `() => void` |  | 当按下“应用”时调用。该按钮仅在提供时呈现，并且在任何块为 `"pending"` 时被禁用。 |
| `className` | `string` |  | 合并到根元素。 |

`DiffHunk` 为 `{ id: string; range: string; decision: HunkDecision; lines: readonly DiffLine[] }`，`HunkDecision` 为 `"pending" | "kept" | "discarded"`。其余 `div` 属性会传给根元素。
