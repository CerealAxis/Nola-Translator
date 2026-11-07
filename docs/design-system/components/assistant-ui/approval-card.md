---
title: Approval card（审批卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Approval card（审批卡片）

在命令或高风险操作执行前请求批准，并显示后续状态。

<demo react="assistant-ui/approval-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-approval-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-approval-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染工具调用

在工具等待用户回答时显示请求态。根据 result 和 status 渲染运行中、已完成或已拒绝的回执。

```tsx
"use client";

import { Trash2Icon } from "lucide-react";
import { defineToolkit, type ToolApprovalResponse } from "@assistant-ui/react";
import { ApprovalCard } from "@/components/assistant-ui/elements/approval-card";

export const toolkit = defineToolkit({
  manage_records: {
    type: "backend",
    render: ({ args, approval, respondToApproval, result }) => {
      const answer = async (response: ToolApprovalResponse) => {
        try {
          await respondToApproval(response);
        } catch (failure) {
          console.error(failure);
        }
      };
      const destructive = args.action === "delete";

      return (
        <ApprovalCard
          state={
            approval?.approved === false
              ? "denied"
              : approval?.approved === undefined
                ? "request"
                : result === undefined
                  ? "running"
                  : "done"
          }
          command={args.command}
          title={args.title}
          subtitle={args.subtitle}
          description={args.description}
          details={args.details}
          variant={destructive ? "destructive" : "default"}
          icon={destructive ? <Trash2Icon className="size-4" /> : undefined}
          onAllowOnce={() => void answer({ optionId: "once" })}
          onAlwaysAllow={() => void answer({ optionId: "always" })}
          onDeny={() => void answer({ optionId: "deny" })}
        />
      );
    },
  },
});
```

使用工具审批时，可参阅 [批准选项](https://www.assistant-ui.com/docs/tools/tool-ui#approval-options)。

### 注册工具包

将批准工具注册到运行时，通过 `addResult` 提交允许或拒绝的结果。

```tsx
import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { toolkit } from "./toolkit";

const config = AuiConfig({ tools: Tools({ toolkit }) });

export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**独立使用**

### 保存批准状态

独立版以 state 控制卡片，按需传入 command、description 和 details。

```tsx
"use client";

import { useState } from "react";
import {
  ApprovalCard,
  type ApprovalState,
} from "@/components/assistant-ui/elements/approval-card";

export function Approval() {
  const [state, setState] = useState<ApprovalState>("request");

  return (
    <ApprovalCard
      state={state}
      command="pnpm vitest run --changed"
      title="运行检查"
      subtitle="代理请求运行 Shell 命令"
      description="运行当前变更涉及的测试。"
      onAllowOnce={() => setState("running")}
      onAlwaysAllow={() => setState("running")}
      onDeny={() => setState("denied")}
    />
  );
}
```

### 处理批准结果

连接 `onAllowOnce`、`onAlwaysAllow` 和 `onDeny`，再根据实际执行结果更新 state。

```tsx
async function run() {
  await runChecks();
  setState("done");
}
```

## 结构 {#anatomy}

标题包含图标、操作名和副标题。操作细节置于正文。底部随状态显示批准选项或回执。

```tsx
<div data-slot="approval-card" data-variant="default | destructive">
  <div>
    <span>{/* 图标 */}</span>
    <p>{/* 标题 */}</p>
    <p>{/* 显示名称或标题 */}</p>
  </div>
  <p>{/* 对应槽位内容 */}</p>
  <div>{/* 对应槽位内容 */}</div>
  <dl>{/* 显示名称或标题 */}</dl>
  <div>{/* 操作控件 */}</div>
</div>
```

标题用作可访问名称，存在描述时会提供给辅助技术。进入 `running`、`done` 或 `denied` 后，回执区域会播报状态。

## 示例 {#examples}

### 批准危险操作

使用 variant="destructive" 突出风险，可提供结构化 details，说明将处理哪些资源。

```tsx
import { Trash2Icon } from "lucide-react";

<ApprovalCard
  state="request"
  variant="destructive"
  icon={<Trash2Icon className="size-4" />}
  title="删除 12 个已归档会话"
  subtitle="此操作不可撤销"
  description="所选会话及其生成的文件将被永久删除。"
  details={[
    { label: "会话", value: "12 archived" },
    { label: "生成的文件", value: "38 files" },
  ]}
  allowOnceLabel="删除会话"
  alwaysAllowLabel="始终允许删除"
  denyLabel="保留会话"
  onAllowOnce={deleteConversations}
  onAlwaysAllow={alwaysDeleteConversations}
  onDeny={closeApproval}
/>
```

### 调整卡片样式

传 `className` 调整根元素布局。

```tsx
<ApprovalCard className="max-w-md" /* ... */ />
```

### 附理由拒绝

在拒绝回调中先收集理由，再通过工具结果提交。回执文案可用 `statusLabel` 提供。

**使用运行时**

```tsx
onDeny={() =>
  void answer({ optionId: "deny", reason: "本次会话不允许" })
}
```

**独立使用**

```tsx
onDeny={() => {
  logDenyReason("本次会话不允许");
  setState("denied");
}}
```

## API 参考 {#api-reference}

**使用运行时**

### 工具调用渲染属性

| 来源 | 类型 | 说明 |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `args.title` / `args.subtitle` | `string` | 标题。 标题下方的次要文案。 |
| `args.command` | `string \| undefined` | 要执行或显示的命令。 |
| `args.description` | `string \| undefined` | 补充说明。 |
| `args.details` | `readonly { label: string; value: string }[] \| undefined` | 按标签和值排列的操作细节。 |
| 渲染器映射 | `"default" \| "destructive"`, `ReactNode \| undefined` | 由渲染器将工具状态映射为卡片状态。 |
| 渲染器文案 | `string \| undefined` | 由渲染器传入各个批准操作的文字。 |
| 结果映射 | `string \| undefined` | 将工具执行结果映射到完成或拒绝回执。 |
| `approval?.approved` | `boolean \| undefined` | 用户批准或拒绝的结果，尚未答复时为 undefined。 |
| `result` | `unknown` | 工具调用结果。工具尚未返回时为 undefined。 |
| `respondToApproval(response)` | `(response: ToolApprovalResponse) => Promise<void>` | 提交一次工具批准答复。 |

**独立使用**

### ApprovalCard

| 属性 | 类型 | 默认值 | 说明 |
| ------------------ | ---------------------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `state` | `"request" \| "running" \| "done" \| "denied"` | 必填 | 当前展示状态，决定图标及可用操作。 |
| `command` | `string \| undefined` |  | 要执行或显示的命令。 |
| `title` | `string` | 必填 | 标题。 |
| `subtitle` | `string` | 必填 | 标题下方的次要文案。 |
| `description` | `string \| undefined` |  | 补充说明。 |
| `details` | `readonly { label: string; value: string }[] \| undefined` |  | 按标签和值排列的操作细节。 |
| `variant` | `"default" \| "destructive"` | `"default"` | 外观变体。危险操作使用 destructive。 |
| `icon` | `ReactNode \| undefined` | 终端图标 | 自定义显示图标。 |
| `allowOnceLabel` | `string \| undefined` | `"Allow once"` | 仅允许本次的按钮文字。 |
| `alwaysAllowLabel` | `string \| undefined` | `"Always allow"` | 始终允许的按钮文字。 |
| `denyLabel` | `string \| undefined` | `"Deny"` | 拒绝按钮文字。 |
| `statusLabel` | `string \| undefined` | 按状态显示 | 覆盖状态回执的文案。 |
| `onAllowOnce` | `() => void` |  | 用户仅允许本次时调用。 |
| `onAlwaysAllow` | `() => void` |  | 用户选择始终允许时调用。 |
| `onDeny` | `() => void` |  | 用户拒绝时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
