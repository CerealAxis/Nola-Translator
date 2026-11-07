---
title: Code runner（代码运行器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Code runner（代码运行器）

展示代码和运行按钮，并在下方显示执行结果。

一个代码块，在用户按下运行之前保持惰性，然后将其输出附加在下面。对于运行时，代码来自用户通过运行它来完成的工具调用。独立运行时，你可以保持运行状态并自行提供输出。

<demo react="assistant-ui/code-runner-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-code-runner"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-code-runner.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

用户通过按下按钮来完成的工具，而不是模型调用它时立即执行的工具，是 `"human"` 工具包条目：它没有 `execute`，因此调用维护展开状态，直到渲染器调用 `addResult`。

### 注册需要用户执行的工具 {#register-a-human-toolkit-entry}

```tsx
"use client";

import { useState } from "react";
import { defineToolkit, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CodeRunner, type RunState } from "@/components/assistant-ui/elements/code-runner";
import { z } from "zod";

type RunArgs = { language: string; code: string };
type RunResult = { output: string[]; durationMs: number };

const RunCodeUI: ToolCallMessagePartComponent<RunArgs, RunResult> = ({ args, result, addResult }) => {
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState<string[]>([]);

  return (
    <CodeRunner
      language={args.language}
      code={args.code}
      state={result ? "ok" : state}
      output={result?.output ?? output}
      durationMs={result?.durationMs}
      onRun={async () => {
        setState("running");
        const startedAt = Date.now();
        const lines = await runInSandbox(args.code);
        setOutput(lines);
        addResult({ output: lines, durationMs: Date.now() - startedAt });
      }}
    />
  );
};

const toolkit = defineToolkit({
  run_code: {
    type: "human",
    description: "在用户按下运行后运行代码片段。",
    parameters: z.object({ language: z.string(), code: z.string() }),
    render: RunCodeUI,
  },
});
```

### 用按钮完成工具调用 {#complete-the-call-from-the-button}

   `addResult(result)` 是此调用完成的唯一方式。没有 `execute` 可供运行时依靠。一旦沙盒运行返回，就从 `onRun` 内部调用它一次。

```tsx
const config = AuiConfig({ tools: Tools({ toolkit }) });
```

   使用 `<AuiProvider extends={aui} config={config}>` 以与任何其他工具包相同的方式安装 `config`。

**独立版**

独立的元素是一个受控组件：你拥有运行状态并在运行产生输出时将输出推送到其中。

### 保持运行状态 {#hold-the-run-state}

```tsx
"use client";

import { useState } from "react";
import { CodeRunner, type RunState } from "@/components/assistant-ui/elements/code-runner";

const code = `console.log("hello")`;

export function Snippet() {
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState<string[]>([]);
  return <CodeRunner language="js" code={code} state={state} output={output} onRun={run} />;
}
```

### 接入运行按钮 {#wire-the-run-button}

```tsx
async function run() {
  setState("running");
  const startedAt = Date.now();
  try {
    const lines = await runInSandbox(code);
    setOutput(lines);
    setState("ok");
  } catch (err) {
    setOutput([err instanceof Error ? err.message : String(err)]);
    setState("error");
  }
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="code-runner">
  <div>{/* language, optional duration, optional run button */}</div>
  <pre>{/* code, always visible */}</pre>
  {/* output block: only once state !== "idle" */}
</div>
```

代码块始终可见。仅当 `state` 离开 `"idle"` 时，才会安装输出块。每条输出线按每线 `80ms` 交错淡入，当 `state` 为 `"error"` 时读取为红色，否则读取为中性。仅当 `state` 是 `"running"` 时（在到目前为止收到的行之后）才会呈现闪烁的插入符号。当提供 `onRun` 时，运行按钮会呈现，并在运行时显示禁用的加载指示器。如果没有 `onRun`，相同的禁用加载指示器仍然会呈现，而 `state` 是 `"running"`，作为状态指示器。仅当已知持续时间且当前未运行运行时，才会显示持续时间徽章。

## 示例 {#examples}

### 读取模型提供的代码 {#read-the-code-the-model-sent}

**运行时版**

`args.language` 和 `args.code` 正是上面 `RunCodeUI` 读到的内容。不会推断出代码本身的任何内容，而是工具调用自己的参数。

```tsx
const RunCodeUI: ToolCallMessagePartComponent<RunArgs, RunResult> = ({ args }) => (
  <CodeRunner language={args.language} code={args.code} state="idle" output={[]} />
);
```

如果没有 `onRun` 回调，此只读示例将不显示运行按钮。

### 调用完成前流式显示输出 {#stream-output-before-completing-the-call}

**运行时版**

`addResult` 只需要在运行完全完成后调用。仍在运行时显示的输出是普通的本地状态，随着行到达而更新：

```tsx
onRun: async () => {
  setState("running");
  const lines: string[] = [];
  for await (const line of runInSandboxStreaming(args.code)) {
    lines.push(line);
    setOutput([...lines]);
  }
  addResult({ output: lines, durationMs: elapsedMs() });
};
```

### 调整代码运行器样式 {#restyle-the-runner}

两种用法都支持通过 `className` 调整根元素。输出块水平滚动 `surfaces.tsx` 中的 `codeScroll`/`codeSurface` 对，这使长行保持可达而不是被剪裁，因此重新定位这些标记会重新设置此元素以及以相同方式滚动预格式化输出的所有其他元素的样式。

## API 参考 {#api-reference}

**运行时版**

### run_code 工具包入口 {#runcode-toolkit-entry}

| 字段 | 类型 | 说明 |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------- |
| `type` | `"human"` | 无 `execute`。调用保持开放状态，直到 `render` 调用 `addResult`。 |
| `parameters` | Zod架构 | 声明 args 形状，上面的 `{ language, code }`。 |
| `render` | `ToolCallMessagePartComponent<RunArgs, RunResult>` | 此调用结果的唯一来源。 |

### 使用的渲染属性 {#render-props-used}

| 字段 | 类型 | 说明 |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `args` | `RunArgs` | 模型发送的语言和代码。 |
| `result` | `RunResult \| undefined` | 一旦 `addResult` 被调用就设置。`undefined` 仍在等待按钮。 |
| `addResult(result)` | `(result: RunResult) => void` | 完成调用。调用一次。 |

**独立版**

### CodeRunner {#coderunner}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ------------------- | -------- | -------------------------------------------------------- |
| `language` | `string` |  | 显示在标题中。 |
| `code` | `string` |  | 逐字呈现的片段。 |
| `state` | `RunState` |  | `"idle" \| "running" \| "ok" \| "error"`. |
| `output` | `readonly string[]` |  | 输出线。当 `state` 为 `"idle"` 时被忽略。 |
| `durationMs` | `number` |  | 显示在已知的运行按钮旁边。 |
| `onRun` | `() => void` |  | 渲染运行按钮，按下时调用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
