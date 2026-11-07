---
title: Assistant modal（助手弹窗）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Assistant modal（助手弹窗）

从角落的按钮打开一个可调整大小的对话浮层。浮层包含完整的对话和会话列表，适用于内嵌助手与帮助入口。

<demo react="assistant-ui/assistant-modal-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/assistant-modal"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/new-york/assistant-modal.json)

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

弹窗由运行时的会话状态驱动，使用运行时版即可。

## 开始使用 {#getting-started}

### 放到应用布局中 {#drop-it-in}

把 `AssistantModal` 放在 `AssistantRuntimeProvider` 下。应用中的官方组件固定在视口角落。文档预览将按钮定位在演示框内。

```tsx
import { AssistantModal } from "@/components/assistant-ui/elements/assistant-modal.aui"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AssistantModal />
    </>
  )
}
```

## 结构 {#anatomy}

```tsx
<div className="aui-modal-anchor">
  <button aria-label="打开助手" />
</div>

<div className="aui-modal-content">
  <button className="aui-modal-resize-handle" aria-label="调整助手窗口大小" />
  <div className="aui-modal-header">
    <h2 className="aui-modal-title">新会话</h2>
    <button className="aui-modal-threads" aria-label="会话列表" />
    <button className="aui-modal-new" aria-label="新建会话" />
  </div>
  <div className="aui-modal-body">
    <div className="aui-modal-thread"><Thread /></div>
    {/* 切换到会话列表时渲染 */}
    <ThreadListRoot className="aui-modal-thread-list" />
  </div>
</div>
```

角落按钮控制浮层，打开时图标切换为收起箭头。浮层标题栏显示当前会话名称，提供会话列表切换和新建会话按钮。选中某个会话或新建会话后返回对话。

浮层打开后，点击外部仍保留对话。按 Escape 或再次点击触发按钮可关闭。可拖动起始侧上角调整尺寸，也可聚焦手柄后用方向键调整。按住 Shift 以较大步长调整。双击手柄或按 Enter、Space 恢复默认大小。组件将尺寸存到浏览器的本地存储。

## 示例 {#examples}

### 从其他位置触发 {#trigger-it-from-elsewhere}

官方 `AssistantModal` 自己管理打开状态。若要从页眉按钮等其他入口控制它，可在项目的组件副本中将打开状态提升到外层，再把它传入 `AssistantModalPrimitive.Root`。

### 调整触发按钮和浮层样式 {#restyle-the-trigger-and-panel}

`aui-modal-anchor` 控制触发器的位置，`aui-modal-button` 控制按钮，`aui-modal-content` 控制浮层的初始大小与过渡。用户调整并保存尺寸后，恢复的行内宽高优先于初始值。

```css
.aui-modal-content {
  width: 28rem;
  height: 36rem;
}
```

## API 参考 {#api-reference}

### AssistantModal {#assistantmodal}

组件没有公开属性，直接使用当前会话运行时。

### 行为 {#behavior}

| 事件 | 效果 |
| --- | --- |
| `thread.runStart` | 会话开始生成时，打开浮层并显示对话。 |

### 类名 {#class-names}

| 类名 | 部位 |
| --- | --- |
| `aui-modal-anchor` / `aui-modal-button` | 触发按钮的容器和按钮本身。 |
| `aui-modal-content` | 对话浮层。 |
| `aui-modal-header` / `aui-modal-title` | 标题栏和标题。 |
| `aui-modal-threads` / `aui-modal-new` | 会话列表切换按钮与新建按钮。 |
| `aui-modal-body` | 浮层内容区。 |
| `aui-modal-thread` / `aui-modal-thread-list` | 对话与会话列表。 |
| `aui-modal-resize-handle` | 起始侧上角的尺寸调节手柄。 |
