---
title: Code diff（代码差异）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Code diff（代码差异）

在对话中显示统一差异，并区分新增和删除的代码。

代码差异显示一个文件已更改的行：顶部是文件名及其净添加和删除，然后是下面的每个上下文、添加和删除的行，每个行都按类型着色和装订线标记。对于运行时，文件名和行来自编辑工具的结果。在独立版中，你可以直接提供相同的形状。

<demo react="assistant-ui/code-diff-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-code-diff"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-code-diff.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CodeDiff, type DiffLine } from "@/components/assistant-ui/elements/code-diff";

type EditFileArgs = { path: string };
type EditFileResult = { additions: number; deletions: number; lines: DiffLine[] };

export const EditFileToolUI: ToolCallMessagePartComponent<
  EditFileArgs,
  EditFileResult
> = ({ args, result }) => {
  if (!result) return null;
  return (
    <CodeDiff
      filename={args.path}
      additions={result.additions}
      deletions={result.deletions}
      lines={result.lines}
      cycle={0}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { EditFileToolUI } from "@/components/assistant-ui/elements/edit-file-tool-ui";

export const toolkit = defineToolkit({
  edit_file: {
    type: "backend",
    render: EditFileToolUI,
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

   调用完成后就会呈现 diff；当它运行时，`result`是`undefined`，上面的渲染器返回`null`。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解介于两者之间的加载状态。

**独立版**

### 保持差异 {#hold-the-diff}

```tsx
"use client";

import { CodeDiff, type DiffLine } from "@/components/assistant-ui/elements/code-diff";

const LINES: DiffLine[] = [
  { kind: "context", text: "export function Composer() {" },
  { kind: "removed", text: "  const [草稿，setDraft] = useState(\"\");" },
  { kind: "added", text: "  const draft = useDraft(threadId);" },
];

export function Patch() {
  return (
    <CodeDiff
      filename="composer.tsx"
      additions={1}
      deletions={1}
      lines={LINES}
      cycle={0}
    />
  );
}
```

### 在新差异上重播 {#replay-on-a-new-diff}

   凹凸 `cycle` 与新的 `lines` 数组一起重新启动交错动画，即使组件保持安装状态：

```tsx
async function reEdit(path: string) {
  const next = await fetchDiff(path);
  setLines(next.lines);
  setCounts({ additions: next.additions, deletions: next.deletions });
  setCycle((c) => c + 1);
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="code-diff">
  <div>{/* filename, +additions and −deletions counts */}</div>
  <div>{/* horizontally scrollable line list, colored and gutter-marked by kind */}</div>
</div>
```

增删计数始终呈现，即使为零。没有隐藏 `+0` 或 `−0` 的阈值。行保留自己的空白并在自己的容器内水平滚动而不是换行，因此长行永远不会将卡推得比其 `max-w-md` 更宽。每行的入口每行交错 `60ms` 并在 `cycle` 上键入，因此碰撞 `cycle` 会重放相同行文本的交错。

## 示例 {#examples}

### 调整差异视图样式 {#restyle-the-diff}

两种用法都支持通过 `className` 调整根元素。卡面来自共享的 `paper` 标记，滚动区域来自 `codeScroll`/`codeSurface`，两者都在 `surfaces.tsx` 中。

```tsx
<CodeDiff className="max-w-none" /* ... */ />
```

### 没有变更行 {#no-lines-changed}

空的 `lines` 数组是有效的差异：标题仍然显示文件名和计数，正文呈现为空滚动区域。

```tsx
<CodeDiff filename="README.md" additions={0} deletions={0} lines={[]} cycle={0} />
```

**独立版**

### 重播入口动画 {#replaying-the-entrance-animation}

将 `cycle` 计数器与加载下一个差异的任何内容配对，以便同一个安装的卡可以显示新的补丁而无需卸载：

```tsx
const [cycle, setCycle] = useState(0);
const [lines, setLines] = useState<DiffLine[]>(INITIAL_LINES);
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `args` | `{ path: string }` | 模型要求编辑的文件。 |
| `result` | `{ additions: number; deletions: number; lines: DiffLine[] } \| undefined` | 调用完成后应用的补丁。 |

请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表和后端工具注册。

**独立版**

### CodeDiff {#codediff}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------------------- | -------- | ------------------------------------------------------------------------ |
| `filename` | `string` |  | 显示在标题中。 |
| `additions` | `number` |  | 标题中的绿色计数。 |
| `deletions` | `number` |  | 标题中的红色计数。 |
| `lines` | `readonly DiffLine[]` |  | 差异视图主体，按顺序排列。 |
| `cycle` | `number` |  | 折叠到每行的键中。增量重放入口动画。 |
| `className` | `string` |  | 合并到根元素。 |

`DiffLine` 是 `{ kind: "context" | "added" | "removed"; text: string }`。其余 `div` 属性会传给根元素。
