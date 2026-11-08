---
title: Tool fallback（工具默认展示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Tool fallback（工具默认展示）

未注册专用界面的工具调用使用默认卡片，展示状态、参数、结果和需要用户处理的请求。

<demo react="assistant-ui/tool-fallback-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/tool-fallback"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

## 快速开始 {#getting-started}

默认对话已经包含工具回退界面，需要时可替换。

### 使用默认卡片 {#its-already-your-default}

当工具调用片段没有自己的 `toolUI` 时，由 `ToolFallback` 渲染。

```tsx
case "tool-call":
  return part.toolUI ?? <ToolFallbackComponent {...part} />;
```

### 替换未注册工具的默认界面 {#replace-it-for-every-unregistered-tool}

向 `Thread` 的 `components.ToolFallback` 提供自定义卡片。

```tsx
<Thread components={{ ToolFallback: MyToolCard }} />
```

## 结构 {#anatomy}

触发器展示工具名称和状态。展开后依次显示可用的错误、参数、确认请求和结果。

```tsx
<div> {/* ToolFallbackRoot, a Collapsible */}
  <button aria-expanded={/* open */}>
    {/* status icon: spinner / check / X-circle / alert */}
    <span>{/* "正在运行工具：<name>", "等待工具操作：<name>", "工具失败：<name>", "已取消工具：<name>", or "已使用工具：<name>" */}</span>
    <span>{/* elapsed duration, while known */}</span>
    {/* chevron, rotates open */}
  </button>
  <div> {/* ToolFallbackContent */}
    {/* error, only while status is "incomplete" and carries one */}
    {/* args, only when argsText is non-empty */}
    {/* approval controls while requires-action, then a receipt of the decision */}
    {/* result, only when result is defined */}
  </div>
</div>
```

## 示例 {#examples}

确认请求的界面取决于工具提供的选项、问题和当前处理状态。

### 未声明选项的确认请求 {#approval-without-declared-options}

卡片展示默认同意与拒绝操作，结果通过恢复回调交给运行时。

```tsx
<ToolFallback {...part} />
```

### 声明选项的确认请求 {#approval-with-declared-options}

通过 `approval.options` 设置按钮的 ID、标签和行为。需要二次确认的选项可标记 `confirm`。

```tsx
approval: {
  id: "call-1",
  options: [
    { id: "once", kind: "allow-once", label: "Allow" },
    { id: "always", kind: "allow-always", label: "始终允许", confirm: true },
    { id: "deny", kind: "reject-once", label: "Deny" },
  ],
}
```

### 已处理请求的回执 {#receipt-of-a-settled-request}

请求处理后保留已选择的结果，便于阅读工具调用历史。

```tsx
approval: {
  id: "call-1",
  approved: true,
  optionId: "always",
  options: [{ id: "always", kind: "allow-always" }],
}
// renders: Allowed · Always allow
```

### 可跳过的问题 {#question-that-accepts-a-dismissal}

当请求允许关闭时提供跳过操作，并把关闭决定通知工具。

```tsx
approval: {
  id: "call-2",
  prompt: "自定义摘要要求",
  display: "text",
  dismissible: true,
}
```

### 一次提出多个问题 {#several-questions-at-once}

把问题放在同一请求中，由用户依次填写，再提交完整答复。

```tsx
approval: {
  id: "call-3",
  display: "questions",
  questions: [
    {
      id: "scope",
      header: "Scope",
      prompt: "需要修改哪些文件夹？",
      options: [
        { id: "src", label: "src" },
        { id: "tests", label: "tests" },
      ],
      multiple: true,
    },
    { id: "note", prompt: "有哪些内容需要避免？" },
  ],
}
```

### 调整单个区域的样式 {#restyle-a-part}

从 `ToolFallback` 组合根节点、触发器、参数或结果部分，并为需要调整的部分传入类名。

```tsx
import { ToolFallbackTrigger, ToolFallbackContent } from "@/components/assistant-ui/elements/tool-fallback.aui";

<ToolFallbackTrigger toolName={part.toolName} status={part.status} className="text-sm" />
```

## API 参考 {#api-reference}

完整卡片可直接接收工具调用消息片段，也可以组合各部分。

### 组件部分 {#parts}

`Root`、`Trigger`、`Content`、`Args`、`Result`、`Error` 和 `Approval` 可分别使用。

### 工具调用片段字段 {#tool-call-part-fields}

状态和工具名控制摘要；`argsText`、`result`、`approval` 和错误字段控制详情。

### 回调 {#callbacks}

批准、拒绝或回复后，使用运行时提供的恢复回调把决定送回工具。

### 组合 {#composition}

把参数、错误、确认和结果放进 `Content`，让同一个触发器管理折叠状态。
