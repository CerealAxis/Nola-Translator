---
title: Permission grant（权限授予）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Permission grant（权限授予）

展示待授权的能力、适用范围及授权时长。

一个能力的门，而不是一个单一的操作：在用户提交之前，被要求的是什么，谁在要求，以及说“是”将会发生什么。对于运行时，此门来自工具调用的批准状态。在独立版中，你自己做出决定。

<demo react="assistant-ui/permission-grant-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-permission-grant"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-permission-grant.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

后端声明工具授权请求（例如 AG-UI 或 ACP 代理）的运行时将 `approval` 对象附加到工具调用部分。阅读它并从显示该工具正常结果的同一渲染器中回答它。

### 读取工具调用的授权请求 {#read-the-approval-gate-from-the-tool-call}

```tsx
"use client";

import type { ToolApprovalResponse, ToolCallMessagePartProps } from "@assistant-ui/react";

function ShellApprovalGate({ args, approval, respondToApproval }: ToolCallMessagePartProps<{ command: string }, string>) {
  if (!approval || approval.approved !== undefined || approval.resolution !== undefined) {
    return null;
  }

  // A refused response rejects and a precondition (an unknown option, an answer
  // the request does not take) throws, so `try`/`await` covers both and the
  // controls stay actionable.
  const answer = async (response: ToolApprovalResponse) => {
    try {
      await respondToApproval(response);
    } catch (failure) {
      console.error(failure);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border p-4">
      <p className="text-sm font-medium">运行： {args.command}</p>
      <div className="flex flex-wrap gap-2">
        {(approval.options ?? []).map((option) => (
          <button key={option.id} type="button" onClick={() => void answer({ optionId: option.id })}>
            {option.label ?? option.kind}
          </button>
        ))}
      </div>
    </div>
  );
}
```

   `approval.approved === undefined` 且无 `resolution` 则将门标记为仍打开。一旦主机记录了一个决定，该部件就会使用 `approval.approved` 集重新渲染，并返回 `null`。

### 使用 respondToApproval 进行答复 {#answer-with-respondtoapproval}

   每个声明的选项都带有自己的 `grants`，选择它的模式或规则将持续存在。在用户提交之前显示它们：

```tsx
{(approval.options ?? []).map((option) => (
  <div key={option.id} className="flex flex-col gap-1">
    <button type="button" onClick={() => void answer({ optionId: option.id })}>
      {option.label ?? option.kind}
    </button>
    {option.grants?.map((grant) => <span key={grant}>{grant}</span>)}
  </div>
))}
```

**独立版**

独立，该元素是完全控制的：你拥有决定权及其授予的内容。

### 维护授权决定 {#hold-the-grant-decision}

```tsx
"use client";

import { useState } from "react";
import { PermissionGrant, type GrantScope } from "@/components/assistant-ui/elements/permission-grant";

export function ShellApproval() {
  const [scope, setScope] = useState<GrantScope | "pending">("pending");
  return (
    <PermissionGrant
      capability="Run shell commands"
      requester="deploy-agent"
      reach={["./workspace/**", "npm run *"]}
      scope={scope}
      onGrant={setScope}
    />
  );
}
```

### 通过 onGrant 完成授权 {#resolve-it-from-ongrant}

   `onGrant` 会根据用户选择的 `"denied"`、`"session"` 或 `"always"` 触发一次。从中设置 `scope` 就足够了。该卡仅在 `scope` 为 `"pending"` 时呈现其按钮。

## 结构 {#anatomy}

```tsx
<div data-slot="permission-grant">
  <div>{/* icon, capability, "requested by {requester}" */}</div>
  <div>{/* "this grants", then one line per reach item */}</div>
  <div>
    {/* pending: Deny / This session / Always */}
    {/* resolved: one badge, keyed on scope so it fades in on change */}
  </div>
</div>
```

三个待处理按钮和已解析徽章是互斥的：一旦 `scope` 不是 `"pending"`，按钮就会消失，并且卡读取 `"denied"` 或 `"granted · {scope}"`。

## 示例 {#examples}

### 确认持久授权 {#confirm-a-persistent-grant}

**运行时版**

`confirm: true`（或 `{ title, description }` 对象）的选项是两步提交：在调用 `respondToApproval` 之前显示其自己的确认，与 `option.grants` 已经承诺的相匹配。

```tsx
const [confirmingId, setConfirmingId] = useState<string | null>(null);
const confirming = approval.options?.find((o) => o.id === confirmingId);

if (confirming) {
  return (
    <div>
      <p>{typeof confirming.confirm === "object" ? confirming.confirm.title : `${confirming.label}?`}</p>
      <button onClick={() => void answer({ optionId: confirming.id })}>确认</button>
      <button onClick={() => setConfirmingId(null)}>返回</button>
    </div>
  );
}
```

### 普通允许或拒绝 {#plain-allow-or-deny}

**运行时版**

`approval.options` 是可选的。当它不存在时，门就是简单的是或否：用 `approved` 而不是 `optionId` 进行响应。

```tsx
<button type="button" onClick={() => void answer({ approved: true })}>
  允许
</button>
<button type="button" onClick={() => void answer({ approved: false })}>
  拒绝
</button>
```

### 调整卡片 {#restyle-the-card}

两种用法都支持通过 `className` 调整根元素。根使用共享的 `paper` 表面，“this grants”标签使用 `mono`，已解析的徽章一起使用 `field` 和 `mono`，而“始终”按钮使用 `inkButton`，因此重新定位 `surfaces.tsx` 中的那些会调整此卡以及基于它们构建的其他所有内容。

## API 参考 {#api-reference}

**运行时版**

### 授权请求 {#approval-gate}

| 字段 | 类型 | 说明 |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approval.id` | `string` | 此批准请求的标识符。 |
| `approval.approved` | `boolean \| undefined` | `undefined`，而门仍然打开。 |
| `approval.options` | `readonly ToolApprovalOption[] \| undefined` | 可用决策。缺席意味着简单的允许或拒绝。 |
| `approval.optionId` | `string \| undefined` | 当存在选项时，在分辨率下选择的选项。 |
| `approval.resolution` | `"cancelled" \| "expired" \| undefined` | 当请求未经用户决定而结束时由主机设置。 |
| `respondToApproval(response)` | `(response: ToolApprovalResponse) => Promise<void>` | 开门。当请求采用自由格式答案时，接受 `{ approved }`、`{ optionId }`、两者或 `{ text }`。仅当 `approved` 和 `resolution` 均未设置时有效。 |

### ToolApprovalOption {#toolapprovaloption}

| 字段 | 类型 | 说明 |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id` | `string` | 主机定义的标识符。 |
| `kind` | `"allow-once" \| "allow-always" \| "reject-once" \| "reject-always"` 或自定义字符串 | 已知类型自动解析`approved`。自定义类型始终需要显式的 `approved` 值。 |
| `label` | `string` | 可选。当它不存在时，渲染器默认为每种类型。 |
| `grants` | `readonly string[]` | 此选项将持续存在的模式或规则，由主机提供。 |
| `confirm` | `boolean \| { title?, description? }` | 此选项解决之前选择加入确认步骤。 |

**独立版**

### PermissionGrant {#permissiongrant}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `capability` | `string` |  | 正在授予什么。 |
| `requester` | `string` |  | 谁要的。 |
| `reach` | `readonly string[]` |  | 此授权将涵盖的模式或规则，在用户提交之前显示。 |
| `scope` | `GrantScope \| "pending"` |  | `"pending"` 显示三个按钮。任何其他值都会显示已解析的徽章。 |
| `onGrant` | `(scope: GrantScope) => void` |  | 从按下的任何待处理按钮调用一次。待授予按钮仅在提供时呈现。 |
| `className` | `string` |  | 合并到根元素。 |

`GrantScope` 是 `"session" | "always" | "denied"`。
