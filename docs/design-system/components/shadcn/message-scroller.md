---
title: Message Scroller（消息滚动区）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Message Scroller（消息滚动区）

聊天滚动容器，支持锚定对话轮次、打开已保存的会话记录、跟随流式回复、无跳动加载历史记录，以及跳转到任意消息。

<demo react="shadcn-base/message-scroller-demo.tsx" />

## 怎样的流式聊天体验才算好 {#what-makes-a-great-streaming-chat-experience}

过去构建聊天界面很简单。创建一个倒序列表和一个
输入框。输入消息后，把它追加到底部。收到回复时，
列表增长并自动滚动。这样就完成了。

流式输出打破了这个模式。消息分段到达时，读者可能还在
阅读、滚动，或查看完全不同的位置。

现在的难题是，如何在会话不断变化时保留读者的位置。
处理不当，界面就会跳动。读者会被拉到底部，失去上下文，
还得自己找回之前的位置。

实际上，这归根结底是滚动行为：何时跟随，何时停留，
何时由读者决定。好的流式聊天应当做到：

1. **只在读者主动要求移动时才移动。** 读者正在阅读时，别把他们拉到别处。自动滚动不应是默认行为。
2. **仅在读者跟随最新内容时继续跟随。** 如果读者停在实时更新的末端，就让流式内容保持可见。如果读者滚离末端，就保留他们当前的位置。
3. **每次交互都是信号。** 滚动只是其中之一。选择文本、使用键盘、打开链接或搜索时，界面都应停止移动。
4. **让新一轮对话从视口顶部附近开始。** 这样读者可以从头读起。
5. **随后流式显示回复。** 让回复逐渐填充屏幕上的空间，避免一开始就把其他内容推走。
6. **保留部分前文作为上下文。** 提示和回复在视觉上应保持连贯，同时保留足够的上一轮内容，让读者知道自己读到哪里。
7. **允许新内容在屏幕外到达。** 会话可以继续接收流式内容，同时保持读者眼前的内容不动。
8. **提示视野之外的变化。** 明确显示回复是否还在生成，或是否有新消息到达。
9. **方便读者返回最新回复。** 提供「跳至最新」操作，帮助读者返回末端并恢复跟随。
10. **允许跳到会话中的任意位置。** 长会话需要消息链接、搜索、未读标记和直接跳转。
11. **重新打开时回到读者离开的位置。** 已保存的会话应打开在最后一个有意义的对话轮次。通常是用户的最后一条消息，直接跳到最底部容易丢失上下文。
12. **布局变化时保留读者的位置。** 图片加载、Markdown 展开、代码块渲染或较早的消息在上方出现时，读者都应留在当前阅读位置。
13. **在中断时保持当前位置。** 停止、重试、重新生成、创建分支或出错时，避免会话位置意外改变。
14. **长会话也要保持流畅。** 即使包含流式文本、Markdown、代码、图片和大量历史消息，交互也应保持流畅。
15. **提供简洁的无障碍体验。** 让会话记录可导航，保留键盘焦点，并以适当的节奏播报重要事件。

**始终尊重读者的滚动意图。**

## MessageScroller {#messagescroller}

MessageScroller 是围绕这些行为构建的会话记录滚动组件。
`MessageScrollerProvider` 管理滚动状态及会话记录各行的行为，包括
打开位置、流式输出、锚定新轮次、在前方加载历史记录、
可见性和滚动控件。`MessageScroller` 是在其中渲染的
带样式外框。

MessageScroller 的职责限于滚动视口。消息、AI 状态、数据传输、
持久化、分支和模型状态由应用自行管理。产品代码可以专注于
组合消息、标记、工具、附件和提示输入框。

它提供聊天所需的滚动行为，其余聊天界面由应用自行组织。
即使在含有丰富 Markdown 内容的长会话中，也能
保持流畅。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add message-scroller
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @shadcn/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/message-scroller.tsx [components/ui/message-scroller.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Message } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
```

```tsx
<MessageScrollerProvider>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent>
        {messages.map((message) => (
          <MessageScrollerItem
            key={message.id}
            messageId={message.id}
            scrollAnchor={message.role === "user"}
          >
            <Message />
          </MessageScrollerItem>
        ))}
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
</MessageScrollerProvider>
```

`MessageScroller` 会填满父容器，请将它放在
高度受限的容器中。

```tsx
<div className="flex h-screen flex-col">
  <MessageScrollerProvider>
    <MessageScroller className="flex-1">{/* transcript */}</MessageScroller>
  </MessageScrollerProvider>
</div>
```

## 组件结构 {#composition}

```tsx
<MessageScrollerProvider>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent>
        <MessageScrollerItem>
          {/* a message, marker, or row */}
        </MessageScrollerItem>
        <MessageScrollerItem />
        <MessageScrollerItem />
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
</MessageScrollerProvider>
```

- **`MessageScrollerProvider`** 是无样式根组件，负责滚动状态及
  打开位置、自动滚动、锚定、滚动命令和
  可见性跟踪的行为属性。
- **`MessageScroller`** 是带样式的外框，负责在 Provider 中布局
  视口、内容和控件。
- **`MessageScrollerViewport`** 是可滚动元素，接收原生滚动事件，
  并在前方插入较早的消息时保留当前可见行。
- **`MessageScrollerContent`** 是会话记录容器，用于存放各行，
  并提供新消息实时播报区域的默认设置。
- **`MessageScrollerItem`** 界定会话记录中的一行。包裹内容容器的
  每个直接子元素，让滚动容器能够测量、锚定、保留位置、
  跟踪可见性并跳转到该行。该项可以是消息、标记、输入状态提示、
  分隔线、加入或离开事件，或「加载更早消息」行。
- **`MessageScrollerButton`** 是滚动控件，滚动到会话记录的开头或末尾，只有对应方向存在可滚动内容时才启用。

## 核心概念 {#core-concepts}

### 锚定对话轮次 {#anchoring-turns}

一轮对话从一次新的交流开始。在简单的 AI 聊天中，
通常是用户发出的消息及随后到达的助手回复。

锚点是视口应视为该轮开头的那一行。使用 `scrollAnchor`
标记这一行。追加新锚点时，视口会将它移到顶部附近，
同时在其上方露出上一项的一部分，使新一轮对话
与前文保持连贯。

```tsx
// This tells the scroller to anchor the user's message for the next turn.
<MessageScrollerItem
  messageId={message.id}
  scrollAnchor={message.role === "user"}
/>
```

滚动锚点与消息角色无关。任何一行都可以作为锚点：
用户消息、系统标记、交接事件，或开启有意义的一轮对话的
其他内容。`MessageScroller` 只需要知道视口
应锚定到哪一行。

在以下示例中，锚点是用户消息。发送新消息时，视口会将其锚定在顶部附近，并在下方追加助手回复。把锚点切换到助手消息，即可观察差异。

<demo react="shadcn-base/message-scroller-anchoring.tsx" />

### 群聊 {#group-chat}

在群聊中，一轮对话的边界比「用户消息」更具体。通常是
请求模型回复的消息，或「Marcus 加入聊天」之类的标记。
输入状态提示和历史记录控件通常不适合作为锚点。

锚定与角色无关，因此既可以锚定消息，
也可以同样方便地锚定标记。

```tsx
<MessageScrollerItem messageId="marcus-joined" scrollAnchor>
  <Marker variant="separator">
    <MarkerContent>Marcus joined the chat</MarkerContent>
  </Marker>
</MessageScrollerItem>
```

<demo react="shadcn-base/message-scroller-group-chat.tsx" />

### 保持上下文可见 {#keeping-context-visible}

开始新一轮时，仍应让读者感觉它属于同一段连贯的会话。
`scrollPreviousItemPeek` 让上一项的一部分
在锚点上方保持可见，使读者能够接上前文，
不会觉得会话重新从空白页开始。

```tsx
// Keep 64px of the previous turn visible above the newly anchored row.
<MessageScrollerProvider scrollPreviousItemPeek={64}>
  <MessageScroller>{/* anchored turns */}</MessageScroller>
</MessageScrollerProvider>
```

调整下方示例中上一项露出的范围，观察它对会话的影响。

<demo react="shadcn-base/message-scroller-previous-context.tsx" />

### 跟随实时更新 {#following-the-live-edge}

读者停留在或返回实时更新的末端时，
`autoScroll` 会在流式回复不断增长时使其保持可见。
通过滚轮、触摸、键盘滚动键或拖动滚动条离开末端时，
会退出跟随。主动跳转到某条消息时也会退出跟随。
之后到达的新内容片段不会再移动读者的位置。

`autoScroll` 可与轮次锚定配合使用。新一轮对话锚定在
顶部附近时，视口保持当前位置，回复则流式填充下方空间。
当回复填满视口后，读者回到实时更新的末端，
跟随输出的行为便从锚定机制接管滚动。

```tsx
<MessageScrollerProvider autoScroll>
  <MessageScroller>{/* streamed turns */}</MessageScroller>
</MessageScrollerProvider>
```

<demo react="shadcn-base/message-scroller-streaming.tsx" />

启用 `autoScroll` 时，调用 `scrollToEnd` 或按下
`MessageScrollerButton` 会重新开启跟随输出，使已经滚动离开的
读者可以返回实时更新的末端并继续跟随。在程序滚动到最新消息
的过程中，根元素和视口会设置 `data-autoscrolling`，
可在过渡期间据此应用样式。

### 打开已保存的会话 {#opening-saved-threads}

将已保存的会话重新打开在记录最末尾，乍看很合理，
但读者往往会因此失去足够的上下文。较好的默认值是
`"last-anchor"`，显示最后一个有意义的对话轮次，例如
用户最近发送的消息，并在下方显示回复。

这样，读者一打开就知道自己在会话中的位置。
可以看到自己问了什么、回复从哪里开始，然后继续阅读，
无需从最底部反推前文。

```tsx
<MessageScrollerProvider defaultScrollPosition="last-anchor">
  <MessageScroller>{/* transcript */}</MessageScroller>
</MessageScrollerProvider>
```

<demo react="shadcn-base/message-scroller-opening-position.tsx" />

`"last-anchor"` 依据 `scrollAnchor` 确定位置，与消息角色无关。
如果没有锚点，或最后一个锚定轮次已能完整放进视口，
则回退到 `"end"`。

若希望从会话开头继续阅读，请使用 `"start"`。
若应落在最新一条消息的位置，请使用 `"end"`。

### 避免重新加载时闪动 {#avoiding-a-flash-on-reload}

滚动容器总是从顶部打开。HTML 无法设置 `scrollTop`，
因此服务端渲染的会话记录会先显示最早的消息。
JavaScript 运行后，`defaultScrollPosition` 移动视口，造成跳动。

当 `defaultScrollPosition` 为 `"end"` 或 `"last-anchor"` 时，
视口会保留 `data-pending-scroll`，直至应用目标位置。带样式的视口
会在此属性存在时隐藏，因此读者看到的是外框，避免目睹跳动。
`"start"` 无需此处理。

若希望首次绘制时即可看到 `"end"` 位置，请紧接视口添加
行内脚本。为视口设置 `id`，将它滚动到底部，再移除
`data-pending-scroll`。

```tsx
const scrollToEndScript = `(function () {
  var viewport = document.getElementById("messages")
  if (!viewport) {
    return
  }
  viewport.scrollTop = viewport.scrollHeight
  viewport.removeAttribute("data-pending-scroll")
})()`

<MessageScroller>
  <MessageScrollerViewport id="messages" suppressHydrationWarning>
    <MessageScrollerContent>{/* transcript */}</MessageScrollerContent>
  </MessageScrollerViewport>
  <script dangerouslySetInnerHTML={{ __html: scrollToEndScript }} />
  <MessageScrollerButton />
</MessageScroller>
```

请将脚本放在页面中，避免放进滚动组件。它仅适用于 `"end"`，
且仅在消息已经包含在 HTML 中时生效。请在视口上添加
`suppressHydrationWarning`。如使用内容安全策略，请传入 `nonce`。

请勿将此脚本与 `"last-anchor"` 搭配使用。如果消息在客户端加载，
也应省略此脚本。

### 加载更早的消息 {#loading-earlier-messages}

加载更早的消息时，应让读者停留在当前浏览的会话位置。
在当前记录上方插入较早的行时，`MessageScrollerViewport`
会保留当前可见行，使读者留在原处，
同时在上方加载历史记录。

此行为通过 `preserveScrollOnPrepend` 默认启用。

<demo react="shadcn-base/message-scroller-load-history.tsx" />

请为消息行使用稳定的 `messageId` 值。这样滚动容器可以
保留指定的行，无需根据恰好位于视口边缘的像素
推测位置。

### 为新消息添加动画 {#animating-new-messages}

`MessageScrollerItem` 可以直接添加动画。创建该组件的 Motion 版本，
保留 `messageId` 和 `scrollAnchor`，使用变换和不透明度实现
入场动画。

聊天界面的常见做法是在发送用户消息时播放动画，然后让
助手回复流式进入下方的普通消息行。让用户消息行从最终位置
下方开始，营造出它从视口的实时更新末端向上浮现的效果。

```tsx
const MotionMessageScrollerItem = motion.create(MessageScrollerItem)
```

<demo react="shadcn-base/message-scroller-animation.tsx" />

避免在消息行入场时对高度、外边距或内边距设置动画，
因为这些变化可能与滚动组件的定位机制冲突。如果读者偏好减少动态效果，
请跳过入场动画，同时保持原有的滚动行为。

### 跳转到消息 {#jumping-to-messages}

搜索结果、永久链接、大纲条目和工具栏按钮经常需要
在消息列表外控制会话记录。请为这些控件使用 `useMessageScroller`。
由于这些 Hook 从 `MessageScrollerProvider` 读取状态，
因此可在 Provider 内的任意组件中使用，包括在
`MessageScroller` 外框之外渲染的控件。

```tsx
import { useMessageScroller } from "@/components/ui/message-scroller"
```

```tsx
const { scrollToMessage, scrollToEnd, scrollToStart } = useMessageScroller()
```

<demo react="shadcn-base/message-scroller-commands.tsx" />

`scrollToMessage` 通过 `MessageScrollerItem` 上的 `messageId` 查找目标，
因此需要支持跳转的行应使用稳定的 ID。目标尚未挂载且无法加入队列时，
`scrollToMessage` 返回 `false`。

`scrollToMessage` 可以在条目出现前将目标加入队列，因此支持
会话记录挂载期间由客户端解析的永久链接。消息行挂载后，
缺失的 ID 会直接返回 `false`，避免盲目循环重试。
返回 `true` 表示滚动已经执行或已加入队列，目标行可能尚未进入视口。

### 跟踪读者的位置 {#tracking-the-reader-s-position}

使用 `useMessageScrollerVisibility` 跟踪读者在会话中的位置。
常见用法是在目录或跳转菜单中
高亮当前锚定的对话轮次。

```tsx
import { useMessageScrollerVisibility } from "@/components/ui/message-scroller"
```

```tsx
const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
```

<demo react="shadcn-base/message-scroller-visibility.tsx" />

`currentAnchorId` 通过返回当前锚定的轮次来回答「我在哪里」，
即使该锚点已经滚到视口上方，也会保留该值。`visibleMessageIds`
按文档顺序回答「屏幕上有哪些消息」。

可见性跟踪按需运行。只有组件订阅了
`useMessageScrollerVisibility` 时才会跟踪，
并且消息行必须拥有 `messageId` 才能参与。

### 读取滚动状态 {#reading-scroll-state}

需要在 JavaScript 中读取滚动状态时，例如实现状态指示器或
自定义「跳至最新」控件，请使用 `useMessageScrollerScrollable`。
它返回视口仍可继续滚动的方向。是否处于开头或末尾由相应值取反得到
（`!start` / `!end`），是否可滚动则由 `start || end` 判断。要为
滚动组件本身设置样式，优先使用 `data-scrollable` 属性。

```tsx
import { useMessageScrollerScrollable } from "@/components/ui/message-scroller"
```

```tsx
const { start, end } = useMessageScrollerScrollable()
```

<demo react="shadcn-base/message-scroller-scrollable.tsx" />

## 性能 {#performance}

`MessageScroller` 的基准测试使用包含 Markdown 和
组合消息行的大型会话记录。

`MessageScroller` 的性能目标是让高频滚动处理独立于 React 状态：
避免重新渲染会话记录行，避免每次滚动都强制执行布局，
并尽可能让浏览器减少屏幕外的绘制工作。

滚动位置、锚定和跟随输出通过命令式方式跟踪，并通过 `data-*` 属性映射到根元素和视口，因此滚动和流式输出不会触发会话记录行重新渲染。

带样式的 `MessageScrollerItem` 还内置 `content-visibility: auto` 和
`contain-intrinsic-size`。消息行仍保留在 DOM 中，支持选择、复制、
页内查找、SSR 和辅助技术，同时允许浏览器跳过
远离视口的行的渲染工作。

可见性跟踪按需运行。跳转菜单或当前轮次指示器
只有在有组件订阅
`useMessageScrollerVisibility` 后才产生跟踪开销。

这足以流畅处理常见的聊天记录规模，即数百到数千轮对话，
其中可包含带 Markdown 和组合组件的消息。

## 虚拟化 {#virtualization}

虚拟化有意放在基础组件之外。`MessageScroller`
渲染真实的 DOM 行，在数千轮对话时仍能保持流畅（参见
[性能](#performance)），因此大多数会话记录无需虚拟化。

当会话记录大到需要虚拟化时，请使用
`MessageScrollerViewport` 作为滚动元素，
并由虚拟化组件管理消息行。

```tsx:line-numbers
import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

function VirtualizedTranscript({
  messages,
}: {
  messages: Array<{ id: string; content: React.ReactNode }>
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 86,
    getItemKey: (index) => messages[index]?.id ?? index,
    overscan: 8,
  })

  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport ref={viewportRef}>
          <MessageScrollerContent className="block min-h-full">
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const message = messages[virtualItem.index]

                if (!message) {
                  return null
                }

                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute start-0 top-0 w-full"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <Message>{message.content}</Message>
                  </div>
                )
              })}
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
```

## 无障碍 {#accessibility}

`MessageScroller` 让键盘能够访问滚动容器，并支持播报
会话记录，同时允许自定义消息界面。

`MessageScrollerViewport` 默认是带标签、可用键盘聚焦的
滚动区域。它使用 `role="region"`、`aria-label="Messages"` 和 `tabIndex={0}`，
因此键盘用户可以聚焦会话记录并直接滚动。

`MessageScrollerContent` 使用 `role="log"` 和 `aria-relevant="additions"`
将会话记录标记为实时播报区域。可以播报新增的消息行，
流式文本的变更无需逐个词元播报。

```tsx
<MessageScrollerContent aria-busy={status === "streaming"}>
  {/* messages */}
</MessageScrollerContent>
```

如果希望等到消息完整后再播报，请在该轮对话流式输出时
传入 `aria-busy`。

`MessageScrollerButton` 渲染真正的按钮。对应方向没有内容可滚动时，
它会设置 `inert`，使用 `tabIndex={-1}`，并提供 `data-active="false"`，
避免处于非活动状态的滚动控件增加额外的焦点停靠点。

## 无样式版本 {#unstyled}

`MessageScroller` 的行为由 `@shadcn/react` 包提供。要搭配
自定义标记和样式直接使用这些行为，请参阅
@shadcn/react 下的 [Message Scroller](https://ui.shadcn.com/docs/react/message-scroller)。

## API 参考 {#api-reference}

各部分的属性、数据属性和 Hook 均记录在
[@shadcn/react Message Scroller](https://ui.shadcn.com/docs/react/message-scroller#api-reference) 页面中。
带样式组件和无样式部件采用相同的 API。
