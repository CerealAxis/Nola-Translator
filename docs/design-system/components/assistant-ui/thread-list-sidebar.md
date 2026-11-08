---
title: Thread list sidebar（会话列表侧栏）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Thread list sidebar（会话列表侧栏）

带页眉、页脚和可选折叠轨道的侧栏框架，将运行时的 [Thread list（对话列表）](/vis/components/assistant-ui/thread-list) 放在当前对话旁边。

<demo react="assistant-ui/thread-list-sidebar-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/threadlist-sidebar"
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

将列表侧栏和对话主体放进同一个 `SidebarProvider`，并在外层挂载 `AssistantRuntimeProvider`。两者分别提供侧栏布局和对话运行时。静态侧栏可直接用 `Sidebar` 包裹独立版对话列表。

### 与 Thread 组合 {#compose-it-with-a-thread}

把 `ThreadListSidebar` 和 `SidebarInset` 作为兄弟节点，在 `SidebarInset` 里渲染 `Thread`。让这组元素处于同一 assistant-ui 运行时下。

```tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/elements/threadlist-sidebar.aui";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";

export default function Layout() {
  return (
    <SidebarProvider>
      <ThreadListSidebar />
      <SidebarInset>
        <Thread />
      </SidebarInset>
    </SidebarProvider>
  );
}
```

## 结构 {#anatomy}

侧栏由顶部的 `SidebarHeader`、容纳 `ThreadList` 的 `SidebarContent` 和底部的 `SidebarFooter` 组成。`collapsible` 不是 `none` 时也会渲染 `SidebarRail`。

```tsx
<Sidebar {...props}>
  <SidebarHeader>{/* assistant-ui wordmark, links out */}</SidebarHeader>
  <SidebarContent>
    <ThreadList />
  </SidebarContent>
  {props.collapsible !== "none" && <SidebarRail />}
  <SidebarFooter>{/* GitHub link */}</SidebarFooter>
</Sidebar>
```

## 示例 {#examples}

侧栏的收起方式、品牌区域和打开按钮可以分别配置。

### 更换收起方式 {#change-the-collapse-behavior}

将 `collapsible` 设为 `icon` 时可收成图标栏；`offcanvas` 将侧栏移出画布，`none` 保持展开。

```tsx
<ThreadListSidebar collapsible="icon" />
```

### 替换页眉和页脚 {#replace-the-header-and-footer-branding}

在安装后的 `threadlist-sidebar.aui.tsx` 中替换页眉和页脚链接。默认分别指向 assistant-ui 官网和 GitHub 仓库。

### 添加打开按钮 {#add-a-trigger-to-open-it}

在同一 `SidebarProvider` 下，将 `SidebarTrigger` 放进页面页眉，供折叠后重新打开。

```tsx
import { SidebarTrigger } from "@/components/ui/sidebar";

<SidebarTrigger />;
```

## API 参考 {#api-reference}

侧栏接受底层 `Sidebar` 的布局属性。

### ThreadListSidebarProps {#threadlistsidebarprops}

类型继承自 `React.ComponentProps<typeof Sidebar>`，属性原样传递给侧栏。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `side` | `"left" \| "right"` | `"left"` | 侧栏停靠的位置。 |
| `variant` | `"sidebar" \| "floating" \| "inset"` | `"sidebar"` | 侧栏外观。 |
| `collapsible` | `"offcanvas" \| "icon" \| "none"` | `"offcanvas"` | 收起方式。`"none"` 同时移除折叠轨道。 |
