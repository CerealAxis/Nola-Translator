---
title: Feedback dialog（反馈对话框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Feedback dialog（反馈对话框）

提交负面评价时，收集用户选择的原因和补充说明。

FeedbackDialog 将反对变成简短的形式：选择出错的地方，添加可选注释，然后发送。在运行时，二进制评级通过 `submitFeedback` 到达会话。在独立版中，你拥有选择、注释以及提交的功能。

<demo react="assistant-ui/feedback-dialog-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-feedback-dialog"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-feedback-dialog.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui自身的反馈信号是二进制的：正或负，记录在消息上。 `ActionBarPrimitive.FeedbackNegative` 已经一键提交。 FeedbackDialog 首先询问原因，因此它位于该信号前面而不是替换它：保留运行时的二进制评级，并传递原因并注释为 `comment`。

### 通过触发器打开面板 {#open-the-panel-from-a-trigger}

   单独的触发器拥有打开状态。 `FeedbackDialog` 本身没有 `open` 属性。一旦安装，它总是呈现其形式（或其确认）。

```tsx
"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/react";
import { FeedbackDialog } from "@/components/assistant-ui/elements/feedback-dialog";

const REASONS = [
  "不符合事实",
  "未遵循说明",
  "太长",
  "不安全",
] as const;

export function MessageFeedback() {
  const aui = useAui();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        报告问题
      </button>
    );
  }

  return (
    <FeedbackDialog
      reasons={REASONS}
      selected={selected}
      note={note}
      sent={sent}
      onToggleReason={(reason) =>
        setSelected((current) =>
          current.includes(reason)
            ? current.filter((item) => item !== reason)
            : [...current, reason],
        )
      }
      onNoteChange={setNote}
      onSubmit={() => {
        const comment = [...selected, note.trim()]
          .filter(Boolean)
          .join(". ")
          .slice(0, 2000);
        aui.message.submitFeedback({ type: "negative", comment });
        setSent(true);
      }}
    />
  );
}
```

### 注册反馈提交目标 {#register-where-feedback-lands}

   `submitFeedback` 达到你在运行时注册的 `FeedbackAdapter`。它的 `submit` 接收消息、类型和可选的 `comment`，因此原因和注释在 `comment` 中传播。当结构性原因必须保持在独立版中，它们仍然需要自己的运输。该示例将评论限制为 2,000 个字符，这是 Assistant Cloud 接受的最长评论。具有另一个限制的后端设置自己的限制。

```tsx
import { useLocalRuntime } from "@assistant-ui/react";

const runtime = useLocalRuntime(adapter, {
  adapters: {
    feedback: {
      submit: ({ message, type, comment }) => {
        fetch("/api/feedback", {
          method: "POST",
          body: JSON.stringify({ messageId: message.id, type, comment }),
        });
      },
    },
  },
});
```

**独立版**

独立，FeedbackDialog 是完全受控的：你持有 `selected`、`note` 和 `sent`，并且 `onSubmit` 不带参数调用，因此它读取你自己的状态而不是接收有效负载。

### 维护表单状态 {#hold-the-form-state}

```tsx
"use client";

import { useState } from "react";
import { FeedbackDialog } from "@/components/assistant-ui/elements/feedback-dialog";

const REASONS = ["不符合事实", "未遵循说明", "太长", "不安全"];

export function AnswerFeedback() {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <FeedbackDialog
      reasons={REASONS}
      selected={selected}
      note={note}
      sent={sent}
      onToggleReason={(reason) =>
        setSelected((current) =>
          current.includes(reason)
            ? current.filter((item) => item !== reason)
            : [...current, reason],
        )
      }
      onNoteChange={setNote}
      onSubmit={() => sendFeedback({ selected, note })}
    />
  );
}
```

### 提交反馈并更新 sent 状态 {#send-it-and-flip-sent}

```tsx
async function sendFeedback(payload: { selected: string[]; note: string }) {
  await fetch("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
  setSent(true);
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="feedback-dialog">
  <div role="status">{/* mounted in both states, so a screen reader catches "sent" the instant it flips */}</div>
  {/* not sent: a header, wrapped reason toggle pills, a note textarea, a submit button */}
  {/* sent: the form is gone; only the confirmation line remains */}
</div>
```

原因作为多选独立切换（`aria-pressed`，任何数字同时有效）。没有最低限度。一旦 `sent` 为真，表单就会完全消失，因此重新打开它以获取第二个报告意味着使用 `sent` 重新安装回 `false`。实时区域在更改之前和之后都存在于树中，而不是与它一起创建，这就是让辅助技术可靠地宣布确认的原因。

## 示例 {#examples}

### 提交后自动重置 {#auto-reset-after-sending}

发送后几秒钟清除 `sent`、`selected` 和 `note` 让同一触发器下次打开一个新表单：

```tsx
useEffect(() => {
  if (!sent) return;
  const id = setTimeout(() => {
    setSent(false);
    setSelected([]);
    setNote("");
  }, 2600);
  return () => clearTimeout(id);
}, [sent]);
```

### 在服务器上接收反馈 {#receiving-feedback-on-the-server}

**运行时版**

外部存储运行时采用与 `useLocalRuntime` 相同的 `feedback` 适配器形状：

```tsx
import { useExternalStoreRuntime } from "@assistant-ui/react";

const runtime = useExternalStoreRuntime({
  // ...messages, onNew, isRunning, etc.
  adapters: {
    feedback: {
      submit: ({ message, type, comment }) => api.rateMessage(message.id, type, comment),
    },
  },
});
```

如果没有注册适配器，`submitFeedback` 仍会在本地更新 `message.metadata.submittedFeedback`，因此即使你从不连接服务器端，`ActionBarPrimitive.FeedbackNegative` 的按下状态也保持正确。

### 调整面板 {#restyle-the-panel}

两种用法都支持通过 `className` 调整根元素。 Pills、文本区域和提交按钮从 `surfaces.tsx` 读取共享的 `field`、`inkButton` 和 `mono` 表面，因此重新着色这些标记会重新着色使用它们的每个元素。

```tsx
<FeedbackDialog className="max-w-md" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器 | 类型 | 说明 |
| -------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `s.message.metadata.submittedFeedback` | `{ type: "positive" \| "negative"; comment?: string } \| undefined` | 已为此消息记录的评级（如果有）。 |
| `aui.message.submitFeedback(feedback)` | `(feedback: { type: "positive" \| "negative"; comment?: string }) => void` | 记录消息的评级并调用已注册的`FeedbackAdapter`。 |

### FeedbackAdapter {#feedbackadapter}

| 字段 | 类型 | 说明 |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit` | `(feedback: { message: ThreadMessage; type: "positive" \| "negative"; comment?: string }) => void` | 每个 `submitFeedback` 调用一次。将其注册在 `useLocalRuntime` 或外部存储运行时的 `adapters.feedback` 下。携带消息、类型和可选注释。 |

**独立版**

### FeedbackDialog {#feedbackdialog}

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reasons` | `readonly string[]` |  | 提供胶囊形标签的原因。 |
| `selected` | `readonly string[]` |  | 当前按下的原因。 |
| `note` | `string` |  | 文本区域的值。 |
| `sent` | `boolean` |  | 如果为真，则将表格交换为确认线。 |
| `onToggleReason` | `(reason: string) => void` |  | 因按下原因而调用。切换 `selected` 中的成员资格是调用者的工作。如果没有它，原因就会呈现为非交互式选择状态标签。 |
| `onNoteChange` | `(note: string) => void` |  | 使用文本区域的下一个值进行调用。 |
| `onSubmit` | `() => void` |  | 调用时不带参数。从你自己的状态读取 `selected` 和 `note`。仅当提供此按钮时，才会呈现提交按钮。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
