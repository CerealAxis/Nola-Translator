---
title: Terminal block（终端输出块）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Terminal block（终端输出块）

逐行显示终端输出，并在结束时显示退出状态。

终端块回显命令并一次显示一行输出。完成的命令带有其真实的退出代码、持续时间和错误输出，而正在运行的命令保留其光标。对于运行时，命令和结果来自工具调用。独立版由调用方直接提供命令和结果。

<demo react="assistant-ui/terminal-block-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-terminal-block"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-terminal-block.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { TerminalBlock } from "@/components/assistant-ui/elements/terminal-block";

type RunCommandArgs = { command: string; cwd?: string };
type RunCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
  truncated?: boolean;
};

export const RunCommandToolUI: ToolCallMessagePartComponent<
  RunCommandArgs,
  RunCommandResult
> = ({ args, result, status }) => {
  const lines = result?.stdout ? result.stdout.split("\n") : [];
  const stderr = result?.stderr ? result.stderr.split("\n") : [];
  return (
    <TerminalBlock
      command={args.command ?? ""}
      lines={lines}
      stderr={stderr}
      cwd={args.cwd}
      exitCode={result?.exitCode}
      durationMs={result?.durationMs}
      truncated={result?.truncated}
      visibleCount={lines.length + stderr.length}
      maxCollapsedLines={12}
      done={status.type !== "running"}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { RunCommandToolUI } from "@/components/assistant-ui/elements/run-command-tool-ui";

export const toolkit = defineToolkit({
  run_command: {
    type: "backend",
    render: RunCommandToolUI,
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

   拥有`run_command`的后端提供其模式和执行器；参见[后端工具](https://www.assistant-ui.com/docs/tools/backend)。

**独立版**

### 维护命令及结果 {#hold-the-command-and-its-result}

```tsx
"use client";

import { TerminalBlock } from "@/components/assistant-ui/elements/terminal-block";

const RESULT = {
  stdout: "RUN v4.0.5\n✓ 3 tests passed",
  stderr: "",
  exitCode: 0,
};

export function TestRun() {
  return (
    <TerminalBlock
      command="pnpm vitest run"
      lines={RESULT.stdout.split("\n")}
      stderr={RESULT.stderr ? RESULT.stderr.split("\n") : []}
      exitCode={RESULT.exitCode}
      visibleCount={2}
      done
    />
  );
}
```

### 显示运行状态 {#show-it-running}

   在进程运行时将 `done` 翻转为 `false`。标题将其复选标记替换为加载指示器，并且光标在最后一个可见行后闪烁：

```tsx
<TerminalBlock command="pnpm vitest run" lines={["运行 v4.0.5"]} visibleCount={1} done={false} />
```

## 结构 {#anatomy}

```tsx
<div data-slot="terminal-block" data-state="done">
  <header>~/app $ pnpm build. exit 0. 840ms. Copy output.</header>
  <div>标准输出。标准错误。显示所有 N 行。输出被截断。</div>
</div>
```

根报告 `data-state="running"`、`"done"` 或 `"failed"`。当它运行时，标题显示一个加载指示器，正文保持闪烁的光标。完成后，默认显示 `exit 0` 或提供的 `exitCode`。非零代码使用红色X。`durationMs`添加紧凑的持续时间，并且当有输出时出现复制动作。

`cwd` 在 `command` 之前呈现为暗淡的 `${cwd}  提示。 `lines` 是 stdout，`stderr` 在失败音中跟随它们，因此 `visibleCount` 在 stderr 之前遍历 stdout。主体保留最低高度，最新显示的线条保持明亮，每条线条都可以包含支持的 ANSI 前景色、粗体和暗淡样式。stderr 行将故障音替换为 ANSI 颜色。其他转义序列在渲染之前被删除。

完成后，`maxCollapsedLines` 最初只能显示第一个显示的行。 `truncated` 添加最后一条 `output truncated` 行，而不更改输出计数。

## 示例 {#examples}

### 渲染命令结果 {#render-a-command-result}

当命令不是来自工具调用时，直接传递结果形状。此失败结果显示提示、ANSI 颜色的 stdout、stderr、其真实退出代码、持续时间和截断通知：

```tsx
const result = {
  stdout: "\u001b[94mBuilding package\u001b[0m\n\u001b[2mChecking types\u001b[0m",
  stderr: "Error: package entry was not found",
  exitCode: 1,
  durationMs: 64_000,
  truncated: true,
};

<TerminalBlock
  cwd="~/app"
  command="pnpm build"
  lines={result.stdout.split("\n")}
  stderr={result.stderr.split("\n")}
  exitCode={result.exitCode}
  durationMs={result.durationMs}
  truncated={result.truncated}
  visibleCount={3}
  done
/>
```

### 折叠已完成的结果 {#collapse-a-completed-result}

`maxCollapsedLines` 仅在该过程完成后适用。控件读取`Show all N lines`直到展开，然后读取`Show less`。它永远不会隐藏仍在流式传输的输出。复制按钮复制 stdout，然后复制 stderr，并用换行符连接。

```tsx
<TerminalBlock
  command="pnpm test"
  lines={allStdout}
  stderr={allStderr}
  visibleCount={allStdout.length + allStderr.length}
  maxCollapsedLines={8}
  done
/>
```

### 深色终端变体 {#ink-variant}

`variant="ink"` 将块反转为实心深色面板，并保持 ANSI 颜色在其上清晰可见。每个结果行为都保持不变。

```tsx
<TerminalBlock variant="ink" command="pnpm vitest run" lines={["✓ 通过 3 项测试"]} visibleCount={1} done />
```

### 调整终端 {#restyle-the-terminal}

两种用法都支持通过 `className` 调整根元素。纸质变体的背景和边框来自`surfaces.tsx`中共享的`paper` token。深色变体使用独立的背景。

```tsx
<TerminalBlock
  className="max-w-none"
  command="pnpm test"
  lines={["✓ 通过 3 项测试"]}
  visibleCount={1}
  done
/>
```

**独立版**

### 重放输出 {#replaying-output}

在计时器上增长 `visibleCount` 以逐行重放捕获的运行，就像目录自己的预览一样：

```tsx
const lines = ["运行 v4.0.5", "✓ 通过 3 项测试"];
const [visibleCount, setVisibleCount] = useState(0);

useEffect(() => {
  if (visibleCount >= lines.length) return;
  const id = setTimeout(() => setVisibleCount((n) => n + 1), 700);
  return () => clearTimeout(id);
}, [visibleCount]);
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `args` | `{ command: string; cwd?: string }` | 命令和可选的工作目录提示符。 |
| `result` | `{ stdout: string; stderr: string; exitCode: number; durationMs?: number; truncated?: boolean } \| undefined` | 完成的命令结果。 `stdout` 变为 `lines`。`stderr`、`exitCode`、`durationMs` 和 `truncated` 传递到 TerminalBlock。 |
| `status` | `ToolCallMessagePartStatus` | `status.type === "running"`，而进程仍在执行。 |
| `visibleCount` | `number` | 按顺序传递显示的 stdout 和 stderr 行数。 |
| `maxCollapsedLines` | `number \| undefined` | 本地渲染设置，用于在用户展开之前限制已完成的结果。 |

请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表和后端工具注册。

**独立版**

### TerminalBlock {#terminalblock}

| 属性 | 类型 | 默认值 | 说明 |
| ------------------- | ------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `command` | `string` |  | 标题中显示的命令行。 |
| `lines` | `readonly string[]` |  | 输出线，按顺序排列。 |
| `visibleCount` | `number` |  | 从`lines`开始要渲染多少行。 |
| `done` | `boolean` |  | 设置标题，显示成功检查或失败的退出代码，并隐藏闪烁的光标。 |
| `exitCode` | `number` | `0` | 完成的过程代码。非零值设置失败状态和红色退出标签。 |
| `stderr` | `readonly string[]` |  | 故障输出附加在`lines`之后。它共享 `visibleCount`。 |
| `cwd` | `string` |  | 工作目录显示为暗色 `${cwd} 提示符。 |
| `durationMs` | `number` |  | 完整的持续时间，格式为毫秒、秒或分钟和秒。 |
| `truncated` | `boolean` |  | 添加最后的 `output truncated` 行。 |
| `maxCollapsedLines` | `number` |  | 完成显示输出以显示在可访问的扩展控件之前。 |
| `variant` | `"paper" \| "ink"` | `"paper"` | 可视面。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
