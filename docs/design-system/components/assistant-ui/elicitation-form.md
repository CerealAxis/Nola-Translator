---
title: Elicitation form（信息征询表单）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Elicitation form（信息征询表单）

工具暂停执行时，通过表单收集服务器缺少的信息。

引出表单是连接的服务器在完成之前需要结构化输入时所显示的内容：一条消息、每个请求字段一个控件以及一对拒绝/发送，一旦应答，就会形成确认。对于运行时，这来自 MCP 服务器的实时启发请求。在独立版中，你可以直接提供字段和状态。

<demo react="assistant-ui/elicitation-form-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-elicitation-form"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-elicitation-form.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

MCP 表单获取是无样式基元，而不是工具包渲染器：`@assistant-ui/react-mcp` 公开 `McpElicitationPrimitive`，并且你直接从其部件构建该元素具有的相同外观。

### 用 McpElicitationPrimitive 组合表单 {#compose-the-form-from-mcpelicitationprimitive}

```tsx
"use client";

import { PlugIcon } from "lucide-react";
import { McpElicitationPrimitive } from "@assistant-ui/react-mcp";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "@/components/assistant-ui/elements/surfaces";

function fieldKind(schema: unknown): "text" | "toggle" {
  return (schema as { type?: string } | undefined)?.type === "boolean"
    ? "toggle"
    : "text";
}

export function McpElicitationForm({ serverName }: { serverName: string }) {
  return (
    <McpElicitationPrimitive.Items>
      {() => (
        <McpElicitationPrimitive.Root
          className={cn(paper, "flex w-full max-w-sm flex-col gap-3.5 rounded-[20px] p-4")}
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 items-center justify-center rounded-lg">
              <PlugIcon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {serverName}
            </span>
          </div>

          <McpElicitationPrimitive.Message className="text-muted-foreground text-xs leading-relaxed" />
          <McpElicitationPrimitive.Error className="text-xs text-red-600 dark:text-red-400" />

          <div className="flex flex-col gap-2.5">
            <McpElicitationPrimitive.Fields>
              {({ name, schema, value, setValue }) => (
                <div className="flex flex-col gap-1">
                  <span className={cn(mono, "text-muted-foreground")}>{name}</span>
                  {fieldKind(schema) === "toggle" ? (
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) => setValue(e.target.checked)}
                    />
                  ) : (
                    <input
                      className={cn(field, "rounded-lg px-2.5 py-1.5 text-xs")}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  )}
                </div>
              )}
            </McpElicitationPrimitive.Fields>
          </div>

          <div className="flex h-8 items-center justify-end gap-2">
            <McpElicitationPrimitive.Decline className="text-muted-foreground h-8 rounded-full px-3.5 text-xs font-medium">
              拒绝
            </McpElicitationPrimitive.Decline>
            <McpElicitationPrimitive.Accept
              className={cn(
                inkButton,
                "flex h-8 items-center rounded-full px-3.5 text-xs font-medium",
              )}
            >
              发送
            </McpElicitationPrimitive.Accept>
          </div>
        </McpElicitationPrimitive.Root>
      )}
    </McpElicitationPrimitive.Items>
  );
}
```

### 将其安装在连接的服务器内 {#mount-it-inside-a-connected-server}

   `MCPElicitation`没有携带自己的服务器id。当你列出连接的服务器时，该请求只能通过你已经位于其中的 `mcpServer` 范围到达。在同一范围内渲染表单，例如在服务器列表的每一行旁边：

```tsx
{servers.map((server) => (
  <McpElicitationForm key={server.id} serverName={server.name} />
))}
```

   请参阅[用户管理的 MCP 服务器](https://www.assistant-ui.com/docs/tools/user-managed-mcp)，用于连接服务器并启用其 `elicitation` 功能。

**独立版**

在独立版中，该元素是完全控制的：你拥有字段列表、其中的值以及它显示的两个固定状态中的哪一个。

### 保留字段和状态 {#hold-the-fields-and-state}

```tsx
"use client";

import { useState } from "react";
import {
  ElicitationForm,
  type ElicitationField,
  type ElicitationState,
} from "@/components/assistant-ui/elements/elicitation-form";

const INITIAL_FIELDS: readonly ElicitationField[] = [
  { name: "repo", label: "存储库", value: "assistant-ui/assistant-ui", kind: "text", required: true },
  { name: "notify", label: "通知观察者", value: "true", kind: "toggle" },
];

export function PublishRequest() {
  const [state, setState] = useState<ElicitationState>("request");
  const [fields, setFields] = useState(INITIAL_FIELDS);

  return (
    <ElicitationForm
      server="github-mcp"
      message="确认发布说明的发布位置。"
      fields={fields}
      state={state}
      onFieldChange={(name, value) =>
        setFields((current) =>
          current.map((item) => (item.name === name ? { ...item, value } : item)),
        )
      }
      onAccept={() => setState("accepted")}
      onDecline={() => setState("declined")}
    />
  );
}
```

### 从自定义结构映射字段类型 {#map-a-fields-kind-from-your-own-schema}

   如果你的字段来自 JSON 模式形状的源而不是手动编写，请从每个属性的模式派生 `kind`，就像运行时通道的 `fieldKind` 对 `requestedSchema` 所做的那样：

```tsx
function toElicitationField(
  name: string,
  schema: { type?: string; enum?: readonly string[] },
  value: string,
): ElicitationField {
  if (schema.type === "boolean") return { name, label: name, value, kind: "toggle" };
  if (schema.enum) return { name, label: name, value, kind: "choice", options: schema.enum };
  return { name, label: name, value, kind: "text" };
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="elicitation-form">
  <div>{/* plug icon, server name, "needs input" tag */}</div>
  <p>{/* message */}</p>
  <div>{/* one row per field: label (+ "*" when required), then a pill group, a switch, a text input, or a static value chip depending on kind and state */}</div>
  <div>{/* Decline / Send while state is "request"; a settled "Sent to {server}" or "Declined" row otherwise */}</div>
</div>
```

一旦 `state` 离开 `"request"`，一个固定的行将取代 Decline 和 Send 控件。它们被删除，而不是被禁用。虽然状态为 `"request"`，但提供 `onFieldChange` 可以使文本、选择和切换字段可编辑。将 `fields` 保持在受控状态，并按名称写回每个报告值。如果没有回调，或者请求解决后，字段将保持仅显示状态。 `"choice"` 字段将 `options` 中的每个选项呈现为一个胶囊形标签，突出显示等于 `value` 的选项，因此该元素信任你将 `value` 保留为列出的选项之一。 `"toggle"` 字段从文字字符串 `"true"` 中读取真实性，而不是从布尔值中读取。

## 示例 {#examples}

### 调整表单 {#restyle-the-form}

两种用法都支持通过 `className` 调整根元素。面板表面、字段标签和发送按钮从 `surfaces.tsx` 中的共享 `paper`、`mono` 和 `inkButton` 标记中读取。

```tsx
<ElicitationForm className="max-w-none" /* ... */ />
```

### 标记必填字段 {#marking-required-fields}

**运行时版**

`requestedSchema.required` 是一个普通的 JSON Schema 数组。检查每个字段的成员资格以添加独立元素使用的相同标记：

```tsx
const required = new Set(
  (elicitation.requestedSchema as { required?: string[] })?.required ?? [],
);
// required.has(name) inside the Fields render prop
```

**独立版**

```tsx
{ name: "repo", label: "仓库", value: "", kind: "text", required: true }
```

虽然请求可编辑，但当任何必需的文本或选择字段为空时，发送将被禁用。在只读模式下，即使必填字段为空，发送也会保持启用状态。

### 拒绝与取消 {#declining-vs-canceling}

**运行时版**

该协议具有三个终端操作：`McpElicitationPrimitive.Cancel` 提交 `{ action: "cancel" }` 以及 Accept 的 `"accept"` 和 Decline 的 `"decline"`。当你的主持人区分“明确拒绝”和“不回答就解雇”时，将其添加为第三个控件：

```tsx
<McpElicitationPrimitive.Cancel className="text-muted-foreground h-8 rounded-full px-3.5 text-xs">
  关闭
</McpElicitationPrimitive.Cancel>
```

**独立版**

独立元素仅模拟两种稳定状态。如果你的应用不需要区分，请将拒绝和解雇都路由到 `onDecline`：

```tsx
<ElicitationForm onDecline={() => setState("declined")} /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### McpElicitationPrimitive {#mcpelicitationprimitive}

| 部分 | 渲染结果 | 说明 |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Items` | 片段 | 读取`state.mcpServer.pendingElicitations`。当列表为空时不渲染任何内容。每个待处理请求一个 `Root` 子树。 |
| `Root` | `div` | 携带`data-elicitation-id`。 |
| `Message` | `span` | 渲染 `elicitation.message` 除非你传递孩子。 |
| `Error` | `div` | 渲染当前验证或服务器错误消息。当不存在时不渲染任何内容。 |
| `Fields` | 渲染属性 | 在 `requestedSchema.properties` 中的每个属性调用其子项一次，每个属性都已包装在该字段自己的 `{ name, schema, value, setValue }` 中。 |
| `Accept` | `button` | 当缺少必填字段或输入的值无效时禁用。提交 `{ action: "accept", content }`。 |
| `Decline` | `button` | 提交 `{ action: "decline" }`。 |
| `Cancel` | `button` | 提交 `{ action: "cancel" }`。在独立元素的两种状态模型中没有等效项。 |

### MCP服务器状态 {#mcp-server-state}

| 选择器 | 类型 | 说明 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s.mcpServer.pendingElicitations` | `readonly MCPElicitation[]` | 当前在此服务器上等待的每个请求。由`Items`读取。 |
| `aui.mcpServer.answerElicitation(id, response)` | `(id: string, response: MCPElicitationResponse) => readonly { property: string; message: string }[] \| undefined` | `Accept`、`Decline` 和 `Cancel` 的称呼。当 `response.action === "accept"` 且值无效时，返回验证错误而不是提交。 |

需要 `@assistant-ui/react-mcp` 和 `elicitation` 功能尚未设置为 `false` 的连接服务器。请参阅[用户管理的 MCP 服务器](https://www.assistant-ui.com/docs/tools/user-managed-mcp)。

**独立版**

### ElicitationForm {#elicitationform}

| 属性 | 类型 | 默认值 | 说明 |
| --------------- | --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `server` | `string` |  | 标题中显示的服务器名称。 |
| `message` | `string` |  | 请求文本。 |
| `fields` | `readonly ElicitationField[]` |  | 请求的字段，按顺序排列。 |
| `state` | `ElicitationState` |  | `"request"` 显示形式。`"accepted"` 或 `"declined"` 用已确定的消息替换页脚。 |
| `onFieldChange` | `(name: string, value: string) => void` |  | 使请求状态字段可编辑并报告每个受控值更改。 |
| `onAccept` | `() => void` |  | 按下“发送”时调用。 |
| `onDecline` | `() => void` |  | 当按下“拒绝”时调用。 |
| `className` | `string` |  | 合并到根元素。 |

`ElicitationField` 为 `{ name: string; label: string; value: string; kind: "text" | "choice" | "toggle"; options?: readonly string[]; required?: boolean }`，`ElicitationState` 为 `"request" | "accepted" | "declined"`。其余 `div` 属性会传给根元素。
