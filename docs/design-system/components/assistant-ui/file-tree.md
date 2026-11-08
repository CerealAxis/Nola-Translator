---
title: File tree（文件树）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# File tree（文件树）

用树形列表展示任务涉及的文件及各自的改动量。

文件树列出了运行所触及的所有内容：带有净总数的“N 个文件已更改”标题，然后每个文件一行，每个文件在文件夹标题下缩进，并带有自己添加和删除的行计数。通过运行时，你可以自己将工具的平面结果映射到树上。在独立版中，你可以直接提供行。

<demo react="assistant-ui/file-tree-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-file-tree"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-file-tree.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

### 从平铺结果构建文件树 {#derive-the-tree-from-a-flat-result}

   工具结果自然是所触摸文件的平面列表。在将其传递给元素之前，将其分组为文件夹标题和缩进文件行：

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { FileTree, type FileTreeNode } from "@/components/assistant-ui/elements/file-tree";

type ChangedFile = { path: string; additions: number; deletions: number };
type ListChangesResult = { files: readonly ChangedFile[] };

function buildFileTree(files: readonly ChangedFile[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  const seenDirs = new Set<string>();

  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : file.path.slice(0, slash);
    const name = slash === -1 ? file.path : file.path.slice(slash + 1);

    if (dir && !seenDirs.has(dir)) {
      seenDirs.add(dir);
      nodes.push({ path: dir, name: dir, depth: 0, kind: "folder" });
    }

    nodes.push({
      path: file.path,
      name,
      depth: dir ? 1 : 0,
      kind: "file",
      additions: file.additions,
      deletions: file.deletions,
    });
  }

  return nodes;
}

export const ListChangesToolUI: ToolCallMessagePartComponent<
  Record<string, never>,
  ListChangesResult
> = ({ result }) => {
  if (!result) return null;
  const nodes = buildFileTree(result.files);
  return (
    <FileTree
      nodes={nodes}
      visibleCount={nodes.length}
      totalAdditions={result.files.reduce((n, f) => n + f.additions, 0)}
      totalDeletions={result.files.reduce((n, f) => n + f.deletions, 0)}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { ListChangesToolUI } from "@/components/assistant-ui/elements/list-changes-tool-ui";

export const toolkit = defineToolkit({
  list_changes: {
    type: "backend",
    render: ListChangesToolUI,
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

**独立版**

### 维护节点列表 {#hold-the-nodes}

```tsx
"use client";

import { FileTree, type FileTreeNode } from "@/components/assistant-ui/elements/file-tree";

const NODES: readonly FileTreeNode[] = [
  { path: "packages/core/src", name: "包/核心/src", depth: 0, kind: "folder" },
  {
    path: "converter",
    name: "convertMessages.ts",
    depth: 1,
    kind: "file",
    additions: 24,
    deletions: 6,
  },
  { path: "changeset", name: ".changeset/tidy-pans.md", depth: 0, kind: "file", additions: 5 },
];

export function Changes() {
  return (
    <FileTree
      nodes={NODES}
      visibleCount={NODES.length}
      totalAdditions={29}
      totalDeletions={6}
    />
  );
}
```

### 随着时间的推移显示行 {#reveal-rows-over-time}

   在计时器上增长 `visibleCount` 以使行淡入，就好像运行仍在发现它们一样：

```tsx
const [visibleCount, setVisibleCount] = useState(0);

useEffect(() => {
  if (visibleCount >= NODES.length) return;
  const id = setTimeout(() => setVisibleCount((n) => n + 1), 420);
  return () => clearTimeout(id);
}, [visibleCount]);
```

## 结构 {#anatomy}

```tsx
<div data-slot="file-tree">
  <div>{/* "N files changed", total +additions and −deletions */}</div>
  <div>{/* one row per visible node, indented by depth × 0.85rem */}</div>
</div>
```

`path` 仅用作React key。行的位置并没有从中得出任何内容。 `depth` 和 `kind` 是你自己分配给每个节点的独立字段，因此文件夹行是静态的、非交互式标题，永远不是其下面的行的真正父级，并且它永远不会折叠。 “N 个文件已更改”计数仅计算 `kind: "file"` 节点，因此文件夹标头永远不会使其膨胀。当该字段为 `undefined` 或 `0` 时，文件自己的添加或删除标记将被省略，不显示为零。标题的总数始终呈现，即使为零。

## 示例 {#examples}

### 调整树 {#restyle-the-tree}

两种用法都支持通过 `className` 调整根元素。卡面和计数徽章来自 `surfaces.tsx` 中共享的 `paper` 和 `mono` 代币。

```tsx
<FileTree className="max-w-none" /* ... */ />
```

### 没有文件夹的文件 {#a-file-with-no-folder}

由于 `depth` 和 `kind` 每个节点都是独立的，因此文件可以位于根元素下，其上方没有文件夹标题。这是像变更集条目这样的松散文件在目录自己的预览中显示的方式：

```tsx
{ path: "changeset", name: ".changeset/tidy-pans.md", depth: 0, kind: "file", additions: 5 }
```

**运行时版**

### 当工具已经返回树时 {#when-the-tool-already-returns-a-tree}

如果工具结果已经带有预成形节点，则完全跳过 `buildFileTree`：

```tsx
export const ListChangesToolUI: ToolCallMessagePartComponent<
  Record<string, never>,
  { files: readonly FileTreeNode[]; additions: number; deletions: number }
> = ({ result }) =>
  result ? (
    <FileTree
      nodes={result.files}
      visibleCount={result.files.length}
      totalAdditions={result.additions}
      totalDeletions={result.deletions}
    />
  ) : null;
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| -------- | ------------------------------------------------ | -------------------------------------------------------- |
| `result` | `{ files: readonly ChangedFile[] } \| undefined` | 调用完成后，所触摸文件的平面列表。 |

没有内置的路径到树帮助器：您自己将平面列表映射到 `FileTreeNode[]`，就像上面 `buildFileTree` 所做的那样，或者让您的工具直接返回预先成形的节点。有关完整的渲染属性列表，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### FileTree {#filetree}

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | ------------------------- | -------- | -------------------------------------------------- |
| `nodes` | `readonly FileTreeNode[]` |  | 完整行列表（按顺序）。 |
| `visibleCount` | `number` |  | 从 `nodes` 开始要渲染多少行。 |
| `totalAdditions` | `number` |  | 标题中的绿色计数。 |
| `totalDeletions` | `number` |  | 标题中的红色计数。 |
| `className` | `string` |  | 合并到根元素。 |

`FileTreeNode` 是 `{ path: string; name: string; depth: number; kind: "folder" | "file"; additions?: number; deletions?: number }`。其余 `div` 属性会传给根元素。
