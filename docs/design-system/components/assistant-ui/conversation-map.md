---
title: Conversation map（对话分支图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Conversation map（对话分支图）

用刻度表示整条对话，每轮一个刻度。当前阅读轮次突出显示，悬停预览内容，点击可跳到对应轮次。

<demo react="assistant-ui/conversation-map-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/conversation-map"
```

React Native 项目可使用原生注册表，属性与 React 版一致。

```bash
npx assistant-ui@latest add elements-conversation-map
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

也可安装通过属性传值的独立组件。

```bash
npx shadcn@latest add "@assistant-ui/elements-conversation-map"
```

## 用法 {#usage}

将 `ConversationMapAui` 作为 `ThreadPrimitive.Viewport` 的直接子节点，使刻度位于居中的消息列旁边。窄屏没有留白时可隐藏。

```tsx
import { ConversationMapAui } from "@/components/assistant-ui/elements/conversation-map.aui";

// A direct child of the viewport, so the rail lands in the gutter
// beside the centered message column. Hide it where there is no gutter.
<ThreadPrimitive.Viewport>
  <ConversationMapAui className="max-sm:hidden" />
  <div className="mx-auto w-full max-w-3xl">
    <ThreadPrimitive.Messages components={{ Message }} />
  </div>
</ThreadPrimitive.Viewport>
```

## 属性 {#props}

`ConversationMapAui` 的 `side` 选择侧栏位置，`className` 设置外层。独立的 `ConversationMap` 接收 `entries`、`activeId`、`visibleIds`、`onSelect` 和 `side`。
