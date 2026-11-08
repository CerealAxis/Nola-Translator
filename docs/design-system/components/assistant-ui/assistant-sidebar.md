---
title: Assistant sidebar（助手侧栏）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Assistant sidebar（助手侧栏）

助手侧栏通过拖动手柄在应用内容与实时对话之间分配屏幕空间。它只管理两栏的大小，右侧始终使用实时 Thread。

<demo react="assistant-ui/assistant-sidebar-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/assistant-sidebar"
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

在 `AssistantRuntimeProvider` 内放置 `AssistantSidebar`，并提供左侧要显示的内容。

### 包裹应用 {#wrap-your-app}

`children` 渲染在左栏，右栏显示完整的 [Thread（对话）](/vis/components/assistant-ui/thread)。

```tsx
import { AssistantSidebar } from "@/components/assistant-ui/elements/assistant-sidebar.aui";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AssistantSidebar>{children}</AssistantSidebar>;
}
```

## 结构 {#anatomy}

`ResizablePanelGroup` 横向放置两个面板和中间的拖动手柄。需要在右侧显示静态内容或非运行时组件时，可直接组合 `ResizablePanelGroup`。

```tsx
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel>{children}</ResizablePanel>
  <ResizableHandle />
  <ResizablePanel>
    <Thread />
  </ResizablePanel>
</ResizablePanelGroup>
```

## 示例 {#examples}

默认两个面板均分宽度，也未设置最小宽度，因此两栏都能拖动到接近零。可以直接组合面板来设置限制或显示握柄。

### 限制分栏比例 {#constrain-the-split}

大小使用数字时表示像素，使用 `"70%"` 这样的字符串表示占面板组宽度的百分比。

```tsx
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel defaultSize="70%" minSize="30%">
    {children}
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize="30%" minSize="20%">
    <Thread />
  </ResizablePanel>
</ResizablePanelGroup>
```

### 显示握柄 {#show-a-grip-on-the-handle}

在直接组合的面板组中，为 `ResizableHandle` 设置 `withHandle`。

```tsx
<ResizableHandle withHandle />
```

## API 参考 {#api-reference}

面板组、面板和手柄分别透传底层可调整面板组件的属性。

### AssistantSidebarProps {#assistantsidebarprops}

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | 必填 | 在左侧面板渲染。 |

### 面板 {#panels}

`ResizablePanelGroup`、`ResizablePanel` 和 `ResizableHandle` 来自 `@/components/ui/resizable`，封装了 `react-resizable-panels` 并透传底层属性，包括 `defaultSize`、`minSize`、`maxSize` 和 `collapsible`。
