---
title: Thread（对话流）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Thread（对话流）

完整的聊天界面，包含消息列表、输入区、滚动定位以及新会话、历史加载和生成中的状态。预览可以发送消息、接收模拟流式回复和停止生成。

<demo react="assistant-ui/thread-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/thread"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/new-york/thread.json)

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

`Thread` 从会话运行时读取状态，使用运行时版即可。

## 开始使用 {#getting-started}

### 在应用中使用 {#use-it-in-your-app}

把 `Thread` 放在运行时 Provider 下，并给外层容器可用的高度。

```tsx
import { Thread } from "@/components/assistant-ui/elements/thread.aui"

export function Chat() {
  return <div className="h-full"><Thread /></div>
}
```

### 覆盖一个插槽 {#override-a-slot}

`components` 允许替换某一部分，例如工具调用的默认界面或连续工具调用的分组。将插槽对象定义在组件外，避免每次渲染都创建一份。单个工具有专用界面时，可按工具名注册渲染器。

```tsx
import { Thread, type ThreadComponents } from "@/components/assistant-ui/elements/thread.aui"

const components: ThreadComponents = {
  ToolFallback: MyToolFallback,
  ToolGroup: MyToolGroup,
}

<Thread components={components} />
```

## 结构 {#anatomy}

```tsx
<ThreadPrimitive.Root>
  <ThreadPrimitive.Viewport>
    {/* 新会话和历史加载状态各有自己的显示区域 */}
    <Welcome />
    <ThreadHistorySkeleton />
    <ThreadPrimitive.Messages>
      {({ message }) =>
        message.role === "user" ? <UserMessage /> : <AssistantMessage />
      }
    </ThreadPrimitive.Messages>
    <ThreadPrimitive.ViewportFooter>
      <ThreadPrimitive.ScrollToBottom />
      <ThreadFollowupSuggestions />
      <Composer />
      <ThreadPrimitive.Suggestions>
        {() => <SuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </ThreadPrimitive.ViewportFooter>
  </ThreadPrimitive.Viewport>
</ThreadPrimitive.Root>
```

- `ThreadPrimitive.Root` 和 `Viewport` 提供会话容器与可滚动区域。欢迎内容、历史加载占位、消息列表与底部输入区都在这个区域内。
- `MessagePrimitive.Root` 和消息片段处理用户、助手和系统消息。语音消息可以合并成连续的语音交流。文件片段会按 MIME 类型选择图片或文件展示。
- `ComposerPrimitive.Root` 管理输入、附件、发送和停止。编辑已发送消息时，编辑器出现在原消息位置。
- 消息操作栏在生成时收起。生成结束后最后一条回复常驻操作栏。消息有多个版本时显示分支选择器。
- 运行时报告有更早记录时，消息列表提供加载入口。插入较早的消息时保留滚动位置，并处理按钮消失后的焦点。
- 为 `TaskGroup` 提供实现后，符合条件的嵌套工具会话可作为独立任务组渲染。已注册工具界面和 MCP 应用仍走各自的渲染路径。

## 示例 {#examples}

### 覆盖组件 {#component-overrides}

只列出要替换的插槽，其余插槽仍由 `Thread` 提供。

```tsx
const components: ThreadComponents = {
  Welcome: () => <p className="text-2xl font-medium">今天想处理什么？</p>,
}

<Thread components={components} />
```

### 调整外壳样式 {#restyle-the-shell}

`ThreadPrimitive.Root` 上的 `--thread-max-width`、`--composer-bg`、`--composer-radius` 和 `--composer-padding` 控制会话宽度和输入区。官方源码把这些变量写在根元素的行内样式里，可在项目自己的组件副本中调整。

```tsx
style={{
  ["--thread-max-width" as string]: "56rem",
  ["--composer-radius" as string]: "var(--radius)",
}}
```

### 在欢迎页提供建议 {#suggestions-on-the-welcome-screen}

用 `AuiConfig` 和 `Suggestions` 向 Provider 传入快捷提问。预览中的两条建议可直接点击发送。

```tsx
import { AuiConfig, AssistantRuntimeProvider, Suggestions } from "@assistant-ui/react"

const config = AuiConfig({
  suggestions: Suggestions(["帮我整理一份会议纪要", "给我一份行动清单"]),
})

<AssistantRuntimeProvider runtime={runtime} config={config}>
  <Thread />
</AssistantRuntimeProvider>
```

## API 参考 {#api-reference}

### ThreadProps {#threadprops}

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `components` | `ThreadComponents` | — | 替换指定插槽。 |
| `autoFocus` | `boolean` | `true` | 在挂载、开始生成、切换会话和滚动到底部时聚焦输入框。文档预览设为 `false`，避免加载页面时抢焦点。 |

### ThreadComponents {#threadcomponents}

| 插槽 | 用途 |
| --- | --- |
| `AssistantMessage` | 替换整条助手消息，包含消息操作和分支切换。 |
| `Welcome` | 替换新会话的欢迎区。 |
| `ToolFallback` | 渲染没有专用界面的工具调用。 |
| `ToolGroup` | 包裹连续的工具调用，可读取分组索引和状态。 |
| `ReasoningGroup` | 包裹连续的推理片段。 |
| `TaskGroup` | 渲染带嵌套会话的工具调用组。 |
| `ComposerExtra` | 在输入区操作栏添加控件。 |

### 基础组件 {#primitives}

| 命名空间 | 用途 |
| --- | --- |
| `ThreadPrimitive` | 会话容器、滚动区、消息、页脚和建议。 |
| `ComposerPrimitive` | 输入、附件拖放、发送、停止和听写。 |
| `MessagePrimitive` | 消息、内容片段、分组和错误状态。 |
| `ActionBarPrimitive` / `ActionBarMorePrimitive` | 复制、编辑、重新生成、导出和更多菜单。 |
| `BranchPickerPrimitive` | 切换同一消息的不同版本。 |
| `AuiIf` | 按运行时状态渲染对应内容。 |

### 会话状态 {#thread-state}

| 选择器 | 类型 | 用途 |
| --- | --- | --- |
| `s.thread.capabilities.dictation` | `boolean` | 是否支持听写。 |
| `s.composer.canCancel` | `boolean` | 是否可取消当前操作。 |
| `s.composer.isEmpty` | `boolean` | 输入区为空时可显示欢迎建议。 |
| `s.composer.dictation` | `DictationState \| undefined` | 听写状态，决定显示开始还是停止。 |
| `s.message.role` | `"user" \| "assistant" \| "system"` | 选择消息的渲染方式。 |
| `s.message.composer.isEditing` | `boolean` | 用户消息是否正在编辑。 |
| `s.message.isCopied` | `boolean` | 是否显示复制完成状态。 |
