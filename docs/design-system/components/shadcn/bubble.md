---
title: Bubble（消息气泡）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Bubble（消息气泡）

在消息气泡中展示对话内容，支持变体、对齐、分组、回应和可折叠内容。

<demo react="shadcn-base/bubble-demo.tsx" />

`Bubble` 组件以气泡的形式显示对话内容。可用它展示聊天文字、简短的结构化输出、引用回复、建议和回应。

要构建功能完整的聊天界面，请使用 [`Message`](https://ui.shadcn.com/docs/components/message) 组件。`Bubble` 只负责气泡本身。将头像、名称、时间戳、元数据和消息级操作放在 [`Message`](https://ui.shadcn.com/docs/components/message) 中。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add bubble
```

</template>

<template #manual>

**1. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/bubble.tsx [components/ui/bubble.tsx]

**2. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble"
```

```tsx:line-numbers
<Bubble>
  <BubbleContent>
    I checked the registry output and removed the stale route.
  </BubbleContent>
  <BubbleReactions>
    <span>👍</span>
  </BubbleReactions>
</Bubble>
```

## 结构 {#composition}

按以下结构组合 bubble：

```text
Bubble
├── BubbleContent
└── BubbleReactions
```

使用 `BubbleGroup` 将同一发送者的连续气泡分组：

```text
BubbleGroup
├── Bubble
│   └── BubbleContent
└── Bubble
    └── BubbleContent
```

## 功能 {#features}

- 七种视觉变体，从醒目的主色气泡到没有外框的 ghost 内容
- 支持起始侧和结束侧对齐，可分别用于发送方和接收方的气泡
- 回应固定在气泡边缘，支持配置位置和对齐方式
- 气泡随内容调整尺寸，最大宽度为容器的 80%
- 通过 `render` 将气泡渲染为链接或按钮
- 每个部分均可通过 `className` 属性自定义样式

## 变体 {#variants}

使用 `variant` 改变气泡的视觉样式。

<demo react="shadcn-base/bubble-variants.tsx" />

| 变体 | 说明 |
| ------------- | ------------------------------------------------------ |
| `default` | 醒目的主色气泡，通常用于当前用户。 |
| `secondary` | 用于对话内容的标准中性气泡。 |
| `muted` | 降低强调程度的气泡，用于辅助内容。 |
| `tinted` | 带淡主色的气泡。 |
| `outline` | 带边框的气泡，用于次要内容或富内容。 |
| `ghost` | 没有外框的内容，用于助手文字或富内容。 |
| `destructive` | 用于错误或失败操作的气泡。 |

气泡随内容调整尺寸，最大宽度为容器的 80%。`ghost` 变体移除最大宽度限制，让助手文字和富内容可以占满整行。

## 对齐 {#alignment}

在 `Bubble` 上使用 `align` 将气泡对齐到对话的起始侧或结束侧。

<demo react="shadcn-base/bubble-alignment.tsx" />

| align | 说明 |
| ------- | -------------------------------------------------- |
| `start` | 将气泡对齐到对话的起始侧。 |
| `end` | 将气泡对齐到对话的结束侧。 |

**注意：** 构建聊天界面时，通常应在 `Message` 组件上设置对齐方式。可以通过 `Message` 组件的 `role` 属性自动将气泡对齐到对话的起始侧或结束侧。

## 气泡组 {#bubble-group}

使用 `BubbleGroup` 将同一发送者的连续气泡分组。请将 `align` 属性设置在 `Bubble` 组件本身。

```text
BubbleGroup
├── Bubble
│   └── BubbleContent
└── Bubble
    └── BubbleContent
```

<demo react="shadcn-base/bubble-group-demo.tsx" />

## 链接和按钮 {#links-and-buttons}

可以通过 `BubbleContent` 上的 `render` 属性将气泡渲染为链接或按钮。

<demo react="shadcn-base/bubble-link-button.tsx" />

```tsx:line-numbers
import { Bubble, BubbleContent } from "@/components/ui/bubble"

export function BubbleLinkDemo() {
  return (
    <Bubble variant="muted">
      <BubbleContent render={<button />}>Click here</BubbleContent>
    </Bubble>
  )
}
```

## 回应 {#reactions}

使用 `BubbleReactions` 显示气泡的回应，也可用它展示快捷操作按钮。通过 `side` 和 `align` 设置整行的位置，`side="top"` 会将它固定在上边缘。回应与气泡边缘重叠，因此应留出行间距，以下示例为此使用了更大的 `gap`。

<demo react="shadcn-base/bubble-reactions.tsx" />

## 显示更多 / 折叠 {#show-more-collapsible}

长篇气泡内容可以和 [`Collapsible`](https://ui.shadcn.com/docs/components/collapsible) 组合，让用户展开更多内容或收起内容。使用 `CollapsibleTrigger` 组件触发折叠内容。

<demo react="shadcn-base/bubble-collapsible.tsx" />

## 工具提示 {#tooltip}

用 [`Tooltip`](https://ui.shadcn.com/docs/components/tooltip) 包裹气泡，即可在悬停时显示元数据，例如消息阅读时间。

<demo react="shadcn-base/bubble-tooltip.tsx" />

## 弹出框 {#popover}

将气泡与 [`Popover`](https://ui.shadcn.com/docs/components/popover) 搭配，可按需显示更多信息，例如操作失败时的完整错误消息。

<demo react="shadcn-base/bubble-popover.tsx" />

## 无障碍 {#accessibility}

`Bubble` 负责呈现消息本身。请在外部容器保留对话层面的语义，并遵循以下指引。

### 为回应添加标签 {#labeling-reactions}

回应渲染为一行表情符号。屏幕阅读器会逐个读出符号，缺乏上下文，而且会将 `+8` 等计数读成「加八」。使用描述性的 `aria-label` 将整行作为一张图像，使它只被播报一次。`role="img"` 也会向辅助技术隐藏单个表情符号，因此无需设置 `aria-hidden`。

```tsx:line-numbers
<BubbleReactions role="img" aria-label="Reactions: thumbs up, fire, and 8 more">
  <span>👍</span>
  <span>🔥</span>
  <span>+8</span>
</BubbleReactions>
```

当回应可交互时，请将它们渲染为按钮，并为纯图标按钮设置 `aria-label`。

```tsx:line-numbers
<BubbleReactions>
  <Button aria-label="Thumbs up" variant="secondary" size="icon-xs">
    <ThumbsUpIcon />
  </Button>
</BubbleReactions>
```

### 交互式气泡 {#interactive-bubbles}

气泡可点击时，请用 `render` 属性将其渲染为原生 `<button>` 或 `<a>`，使其可聚焦并向辅助技术提供正确的角色。`BubbleContent` 为交互元素提供可见的焦点环，无障碍名称来自气泡文字，无需额外标签。

```tsx:line-numbers
<Bubble variant="muted" align="end">
  <BubbleContent render={<button type="button" onClick={onReply} />}>
    I forgot my password
  </BubbleContent>
</Bubble>
```

### 用文字等方式补充颜色信息 {#meaning-beyond-color}

气泡变体通过颜色传达角色和语气。搭配文字、对齐方式或图标，让颜色之外也有信息提示。对于 `destructive` 气泡，请在消息文字中保留错误背景。

## API 参考 {#api-reference}

### Bubble {#bubble}

气泡的根包裹元素。

| 属性        | 类型                                                                                       | 默认值     | 说明                                      |
| ----------- | ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------ |
| `variant`   | `"default" \| "secondary" \| "muted" \| "tinted" \| "outline" \| "ghost" \| "destructive"` | `"default"` | 气泡的视觉样式。 |
| `align`     | `"start" \| "end"`                                                                         | `"start"`   | 气泡在行内方向上的对齐方式。 |
| `className` | `string`                                                                                   | -           | 应用于根元素的附加类。 |

### BubbleContent {#bubblecontent}

包裹气泡内容。

| 属性        | 类型                       | 默认值 | 说明                                               |
| ----------- | -------------------------- | ------- | --------------------------------------------------------- |
| `render`    | `ReactElement \| function` | -       | 将内容渲染为其他元素，例如链接。 |
| `className` | `string`                   | -       | 应用于内容元素的附加类。 |

### BubbleReactions {#bubblereactions}

显示与气泡边缘重叠的回应。

| 属性        | 类型                | 默认值    | 说明                                      |
| ----------- | ------------------- | ---------- | ------------------------------------------------ |
| `side`      | `"top" \| "bottom"` | `"bottom"` | 回应固定在气泡的哪一侧。 |
| `align`     | `"start" \| "end"`  | `"end"`    | 回应在行内方向上的对齐方式。 |
| `className` | `string`            | -          | 应用于回应行的附加类。 |

### BubbleGroup {#bubblegroup}

将同一发送者的连续气泡分组。

| 属性        | 类型     | 默认值 | 说明                                    |
| ----------- | -------- | ------- | ---------------------------------------------- |
| `className` | `string` | -       | 应用于组根元素的附加类。 |
