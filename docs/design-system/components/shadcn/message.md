---
title: Message（消息）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Message（消息）

在会话中显示消息，支持可选头像、顶部与底部区域以及对齐方式。

<demo react="shadcn-base/message-demo.tsx" />

`Message` 组件负责布局会话中的单条消息，处理消息主体周围的头像、对齐、顶部和底部区域。

在 AI 应用中，可以使用 `Message` 组件渲染推理步骤、工具调用和助手消息。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add message
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/message.tsx [components/ui/message.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
```

```tsx:line-numbers
<Message>
  <MessageAvatar>
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  </MessageAvatar>
  <MessageContent>
    <Bubble>
      <BubbleContent>How can I help you today?</BubbleContent>
    </Bubble>
  </MessageContent>
</Message>
```

**注意：** `Message` 负责消息行的布局，包括头像、对齐、顶部和底部区域。
使用
[`Bubble`](https://ui.shadcn.com/docs/components/bubble) 在其中渲染可见的消息主体。会话外层的滚动容器
使用 [`MessageScroller`](https://ui.shadcn.com/docs/components/message-scroller)。

## 组件结构 {#composition}

使用以下结构构建消息：

```text
Message
├── MessageAvatar
└── MessageContent
    ├── MessageHeader
    ├── Bubble
    └── MessageFooter
```

使用 `MessageGroup` 堆叠同一发送者连续发出的消息：

```text
MessageGroup
├── Message
└── Message
```

## 特性 {#features}

- 通过 `align` 属性将发送方与接收方的消息行分别对齐到起始侧和末尾侧
- 头像插槽与消息底部对齐，避开底部区域
- 顶部和底部插槽可显示发送者姓名、状态和消息操作
- 底部区域跟随消息所在的一侧，操作按钮在 `align="end"` 的行中也保持对齐
- 分组容器堆叠同一发送者连续发出的消息
- 每个部分都可通过 `className` 属性自定义样式

## 头像 {#avatar}

使用 `MessageAvatar` 在消息旁渲染头像。在消息上设置 `align="end"` 可让头像与消息的末尾侧对齐。

<demo react="shadcn-base/message-avatar.tsx" />

| align | 说明 |
| ------- | --------------------------------------------------- |
| `start` | 将消息对齐到会话的起始侧。 |
| `end` | 将消息对齐到会话的末尾侧。 |

## 分组 {#group}

使用 `MessageGroup` 堆叠同一发送者连续发出的消息。在前面的消息中渲染空的 `MessageAvatar`，使它们与最后一条消息的头像对齐。

<demo react="shadcn-base/message-group.tsx" />

## 顶部和底部区域 {#header-and-footer}

使用 `MessageHeader` 显示发送者姓名，使用 `MessageFooter` 显示送达或已读状态等元数据。

<demo react="shadcn-base/message-header-footer.tsx" />

## 操作 {#actions}

将复制、重试或反馈按钮等消息操作放在 `MessageFooter` 中。

<demo react="shadcn-base/message-actions.tsx" />

## 附件 {#attachment}

<demo react="shadcn-base/message-attachment.tsx" />

## 无障碍 {#accessibility}

`Message` 是用于呈现的布局容器。无障碍功能由其中放置的内容决定。

### 为纯图标操作添加标签 {#label-icon-only-actions}

`MessageFooter` 中的操作按钮通常只有图标，因此请为每个按钮添加 `aria-label`。

```tsx:line-numbers
<MessageFooter>
  <Button variant="ghost" size="icon" aria-label="Copy">
    <CopyIcon />
  </Button>
</MessageFooter>
```

### 状态更新 {#status-updates}

对于进行中的消息，请使用带 `role="status"` 的 [`Marker`](https://ui.shadcn.com/docs/components/marker)，使辅助技术在更新出现时播报。

```tsx:line-numbers
<Message>
  <Marker role="status">
    <MarkerIcon>
      <Spinner />
    </MarkerIcon>
    <MarkerContent>Checking the logs...</MarkerContent>
  </Marker>
</Message>
```

## API 参考 {#api-reference}

### Message {#message}

消息行容器。

| 属性        | 类型               | 默认值   | 说明                                       |
| ----------- | ------------------ | --------- | ------------------------------------------------- |
| `align` | `"start" \| "end"` | `"start"` | 消息在会话中的对齐方式。 |
| `className` | `string` | - | 应用于消息行的附加类。 |

### MessageGroup {#messagegroup}

将同一发送者连续发出的消息分组。

| 属性        | 类型     | 默认值 | 说明                                    |
| ----------- | -------- | ------- | ---------------------------------------------- |
| `className` | `string` | - | 应用于分组根元素的附加类。 |

### MessageAvatar {#messageavatar}

头像插槽，与消息底部对齐。当消息包含 `MessageFooter` 时，头像会上移，与消息主体底部对齐。

| 属性        | 类型     | 默认值 | 说明                                     |
| ----------- | -------- | ------- | ----------------------------------------------- |
| `className` | `string` | - | 应用于头像插槽的附加类。 |

### MessageContent {#messagecontent}

包裹顶部区域、消息主体和底部区域。

| 属性        | 类型     | 默认值 | 说明                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | - | 应用于内容插槽的附加类。 |

### MessageHeader {#messageheader}

在消息上方显示发送者姓名等内容。无论 `align` 的值为何，始终在起始侧对齐。

| 属性        | 类型     | 默认值 | 说明                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | - | 应用于顶部区域的附加类。 |

### MessageFooter {#messagefooter}

在消息下方显示状态或操作等内容。与消息所在的一侧对齐。

| 属性        | 类型     | 默认值 | 说明                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | - | 应用于底部区域的附加类。 |
