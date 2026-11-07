---
title: Connection state（连接状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Connection state（连接状态）

提示会话连接阶段，并支持在中断后继续。

<demo react="assistant-ui/connection-state-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-connection-state"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-connection-state.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 追踪运行的连接阶段

在运行前后追踪连接阶段，把当前 phase 交给提示条。

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { ConnectionState, type ConnectionPhase } from "./connection-state";

function ConnectionBanner({ resumeFromId }: { resumeFromId: string | null }) {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [phase, setPhase] = useState<ConnectionPhase>("online");

  useEffect(() => {
    if (phase === "reconnecting" && isRunning) setPhase("resumed");
  }, [phase, isRunning]);

  return (
    <ConnectionState
      phase={phase}
      onRetry={() => {
        setPhase("reconnecting");
        aui.thread.resumeRun({ parentId: resumeFromId });
      }}
    />
  );
}
```

### 恢复已有运行

重连后调用会话的恢复动作，延续已有运行。

```tsx
aui.thread.resumeRun({ parentId: resumeFromId, sourceId: null });
```

**独立使用**

### 控制连接阶段

独立版自行设置连接、离线和恢复等阶段。

```tsx
"use client";

import { useState } from "react";
import { ConnectionState, type ConnectionPhase } from "@/components/assistant-ui/elements/connection-state";

export function Banner() {
  const [phase, setPhase] = useState<ConnectionPhase>("online");
  return (
    <ConnectionState
      phase={phase}
      attempt={phase === "reconnecting" ? 1 : undefined}
      onRetry={() => setPhase("reconnecting")}
    />
  );
}
```

### 恢复后清除提示

确认恢复后清理提示，回到正常在线状态。

```tsx
useEffect(() => {
  if (phase !== "resumed") return;
  const id = setTimeout(() => setPhase("online"), 2000);
  return () => clearTimeout(id);
}, [phase]);
```

## 结构 {#anatomy}

提示条组合连接状态图标、文案和可选操作。

```tsx
<div data-slot="connection-state">
  {/* 操作控件 */}
  {/* 显示加载状态 */}
  {/* 对应槽位内容 */}
</div>
```

`online` 不渲染提示条。其余三个阶段有各自的图标与说明，`attempt` 和 `resumedTokens` 只在传入时显示。

## 示例 {#examples}

### 所有阶段

在连接中断、重连与恢复时分别更新 phase。

```tsx
<ConnectionState phase="dropped" onRetry={() => {}} />
<ConnectionState phase="reconnecting" attempt={2} />
<ConnectionState phase="resumed" resumedTokens={340} />
```

### 隐藏在线提示

正常在线时可在调用方直接省略提示条。

## API 参考 {#api-reference}

**使用运行时**

### 会话方法

| 方法 | 类型 | 说明 |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `aui.thread.resumeRun(config)` | `(config: CreateResumeRunConfig) => void` | 恢复已中断的运行。 |
| `aui.thread.cancelRun()` | `() => void` | 取消当前运行。 |

连接中断阶段由应用和传输适配器维护，可将其映射为提示条的 `phase`。

**独立使用**

### ConnectionState

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | ------------------------------------------------------ | -------- | ---------------------------------------------------- |
| `phase` | `"online" \| "dropped" \| "reconnecting" \| "resumed"` | 必填 | 当前连接阶段。 |
| `attempt` | `number` |  | 当前重连尝试次数。 |
| `resumedTokens` | `number` |  | 恢复时接续的 token 数。 |
| `onRetry` | `() => void` |  | 用户请求重连时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
