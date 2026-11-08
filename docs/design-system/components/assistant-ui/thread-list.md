---
title: Thread list（会话列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Thread list（会话列表）

显示已有会话，并支持切换、新建、重命名、归档和删除。页首预览可在运行时版与独立版之间切换。

<demo react="assistant-ui/thread-list-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**运行时版**

```bash
npx shadcn@latest add "@assistant-ui/thread-list"
```

**独立版**

```bash
npx shadcn@latest add "@assistant-ui/elements-thread-list"
```

</template>

<template #manual>

- [运行时版](https://r.assistant-ui.com/styles/new-york/thread-list.json)
- [独立版](https://r.assistant-ui.com/styles/new-york/elements-thread-list.json)

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

独立版由调用方传入列表与回调，无需 Provider。

## 开始使用 {#getting-started}

### 直接使用运行时版 {#use-it-directly}

运行时版放在 `AssistantRuntimeProvider` 下即可。会话记录、当前选中项和列表操作都来自运行时。

```tsx
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui"

export function Sidebar() {
  return <aside className="w-64 p-2"><ThreadList /></aside>
}
```

### 自行管理会话状态 {#hold-the-thread-state}

独立版由外层保存列表和当前选中索引。新建和搜索可以放在列表外。

```tsx
import { useState } from "react"
import { ThreadList, type ThreadItem } from "@/components/assistant-ui/elements/thread-list"

const threads: ThreadItem[] = [
  { id: "notes", title: "会议纪要", time: "刚刚", unread: true },
  { id: "review", title: "译文校对", time: "30 分钟前" },
]

export function Conversations() {
  const [activeIndex, setActiveIndex] = useState(0)
  return <ThreadList threads={threads} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} />
}
```

## 结构 {#anatomy}

```html
<div data-slot="aui_thread-list-root">
  <button data-slot="aui_thread-list-new">新建会话</button>
  <div data-slot="aui_thread-list-search"></div>
  <div data-slot="aui_thread-list-items">
    <div data-slot="aui_thread-list-group-label">今天</div>
    <div data-slot="aui_thread-list-item">
      <button data-slot="aui_thread-list-item-trigger">会议纪要</button>
      <button data-slot="aui_thread-list-item-more" aria-label="更多操作"></button>
    </div>
  </div>
</div>
```

运行时版由新建按钮、搜索框、分组列表、会话行和每行的更多菜单组成。列表有记录后显示搜索框。运行时提供 `lastMessageAt` 时，列表会按今天、昨天和更早分组。当前行有 `data-active` 和 `aria-current`。

独立版按传入顺序展示，并显示一个固定的「今天」组标题。重命名与删除按钮是否出现取决于对应的回调。

## 示例 {#examples}

### 搜索 {#search}

运行时版会按标题过滤。独立版先过滤数据，再把结果传给组件。过滤后，应该按会话 ID 重新计算当前行在可见列表中的索引。

```tsx
const visible = threads.filter((item) =>
  item.title.toLowerCase().includes(query.toLowerCase()),
)
<ThreadList
  threads={visible}
  activeIndex={visible.findIndex((item) => item.id === activeId)}
  onActiveIndexChange={(index) => setActiveId(visible[index].id)}
/>
```

### 重命名 {#renaming}

运行时版从更多菜单打开行内编辑框，Enter 或失焦保存，Escape 取消。也可直接按 ID 调用运行时。独立版用 `onRename(index)` 打开自己的输入框。

```tsx
const aui = useAui()
aui.threads.item({ id: threadId }).rename("译文校对")
```

```tsx
<ThreadList
  threads={threads}
  activeIndex={activeIndex}
  onActiveIndexChange={setActiveIndex}
  onRename={(index) => setRenamingIndex(index)}
  onDelete={(index) => {
    const remaining = threads.filter((_, row) => row !== index)
    setThreads(remaining)
    setActiveIndex(Math.min(remaining.length - 1, activeIndex - Number(index < activeIndex)))
  }}
/>
```

### 调整样式 {#restyle}

运行时版由外层容器控制宽度。独立版支持根元素的 `className`，当前项和时间文字的样式可在共享的 `field`、`mono` 中调整。

```tsx
<ThreadList className="max-w-70" threads={threads} activeIndex={activeIndex} />
```

## API 参考 {#api-reference}

### ThreadListPrimitive {#threadlistprimitive}

| 部件 | 用途 |
| --- | --- |
| `Root` | 列表容器，提供键盘焦点组。 |
| `New` | 切换到新会话，已在新会话时带有 `data-active`。 |
| `ItemByIndex` | 按索引为单行建立会话上下文，可用于自定义分组。 |

### ThreadListItemPrimitive 和 ThreadListItemMorePrimitive {#threadlistitemprimitive-and-threadlistitemmoreprimitive}

| 部件 | 用途 |
| --- | --- |
| `ThreadListItemPrimitive.Root` | 会话行及当前项状态。 |
| `ThreadListItemPrimitive.Trigger` / `Title` | 切换会话与显示标题。 |
| `ThreadListItemPrimitive.Archive` / `Delete` | 归档与删除，支持 `asChild`。 |
| `ThreadListItemMorePrimitive.Root` | 更多菜单。`sharedFocusGroup` 将菜单纳入列表的键盘导航。 |
| `ThreadListItemMorePrimitive.Trigger` / `Content` / `Item` | 菜单触发器、浮层和菜单项。 |

### 会话列表状态 {#thread-list-state}

| 选择器或方法 | 用途 |
| --- | --- |
| `s.threads.threadIds` / `s.threads.threadItems` | 按显示顺序读取会话 ID 和数据。 |
| `s.threads.isLoading` | 列表是否正在加载。 |
| `s.threadListItem.id` / `title` / `isRunning` | 当前行的 ID、标题与生成状态。 |
| `aui.threads.item({ id }).rename(title)` | 通过 ID 重命名会话。 |

### ThreadList {#threadlist}

| 独立版属性 | 类型 | 说明 |
| --- | --- | --- |
| `threads` | `readonly ThreadItem[]` | 必填，按显示顺序排列。 |
| `activeIndex` | `number` | 必填，当前行的索引。 |
| `onActiveIndexChange` | `(index: number) => void` | 切换当前行。省略时各行仅用于展示。 |
| `onRename` / `onDelete` | `(index: number) => void` | 提供回调后显示对应的行操作。 |
| `className` | `string` | 合并到根元素。 |

其余 `div` 属性也会传给根元素。

### ThreadItem {#threaditem}

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 稳定的会话标识。 |
| `title` | `string` | 会话标题。 |
| `time` | `string` | 格式化后的时间文字。 |
| `unread` | `boolean` | 未读且未选中时显示圆点。 |
