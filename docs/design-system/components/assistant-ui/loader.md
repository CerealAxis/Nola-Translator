---
title: Loader（加载指示器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Loader（加载指示器）

在助手生成第一段内容前，用九宫格动画和状态文案提示用户正在等待。

<demo react="assistant-ui/loader-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-loading-state"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/new-york/elements-loading-state.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

首次接入运行时时，执行初始化命令，再用 `AssistantRuntimeProvider` 包住需要读取会话状态的组件。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk"

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
```

首次配置可参阅 [assistant-ui 安装指南](https://www.assistant-ui.com/docs/installation)。

同一个 `GenerationLoader` 也可独立使用。直接传入 `label` 和 `tick` 即可，无需运行时或 Provider。

## 开始使用 {#getting-started}

### 仅在等待首段内容时显示 {#gate-it-on-an-empty-run}

从运行时读取当前分支的最后一条消息。会话正在生成、最后一条是助手消息且还没有内容片段时，显示加载指示器。

```tsx
import { useAuiState } from "@assistant-ui/react"

function useIsAwaitingFirstToken() {
  return useAuiState((s) => {
    const last = s.thread.messages.at(-1)
    return s.thread.isRunning && last?.role === "assistant" && last.parts.length === 0
  })
}
```

### 在本地推进动画 {#drive-the-tick-locally}

运行时提供生成状态。用定时器推进 `tick`，在首段内容到达后取消定时器，并把位置交给消息内容。

```tsx
import { useEffect, useState } from "react"
import { GenerationLoader } from "@/components/assistant-ui/elements/loading-state"

function useTick(active: boolean) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((value) => value + 1), 120)
    return () => clearInterval(timer)
  }, [active])
  return tick
}

function AwaitingFirstToken() {
  const waiting = useIsAwaitingFirstToken()
  const tick = useTick(waiting)
  return waiting ? <GenerationLoader label="正在生成" tick={tick} /> : null
}
```

### 独立控制标签和动画进度 {#hold-tick-and-label-in-state}

独立版由外层传入标签和计数，可用于等待导入、校对等任务。

```tsx
function Loader({ label }: { label: string }) {
  const tick = useTick(true)
  return <GenerationLoader label={label} tick={tick} />
}
```

### 任务完成时停止计时 {#stop-the-timer-when-it-settles}

任务结束后卸载加载指示器。它按传入的 `tick` 绘制，没有 `active` 或 `done` 属性。

## 示例 {#examples}

### 单元格形状 {#cell-shapes}

`variant` 可选 `dots`、`squares` 或 `rounded`。页首预览可切换三种形状。

```tsx
<GenerationLoader label="正在生成" tick={tick} variant="squares" />
```

### 调整网格颜色 {#restyle-the-grid}

网格用不同透明度区分点亮和变暗的单元格。可通过 `className` 指定主题色，标签的闪光效果由 `ShimmerLabel` 提供。

```tsx
<GenerationLoader label="正在生成" tick={tick} className="[&_[aria-hidden]_span]:bg-primary" />
```

## API 参考 {#api-reference}

### 会话状态 {#thread-state}

| 选择器 | 类型 | 用途 |
| --- | --- | --- |
| `s.thread.isRunning` | `boolean` | 当前是否正在生成。 |
| `s.thread.messages` | `readonly MessageState[]` | 当前分支的消息，可读取最后一条的 `role` 和 `parts`。 |

### GenerationLoader {#generationloader}

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `label` | `string` | 必填 | 网格下方的状态文字。 |
| `tick` | `number` | 必填 | 外部传入的动画计数。 |
| `variant` | `"dots" \| "squares" \| "rounded"` | `"dots"` | 单元格形状。 |
| `className` | `string` | — | 合并到根元素。 |

除 `children` 外，其余 `div` 属性会传给根元素。
