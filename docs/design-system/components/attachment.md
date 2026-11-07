---
title: Attachment（附件）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Attachment（附件）

显示文件或图像附件，包含媒体、元数据、上传状态和操作。

<demo react="shadcn-base/attachment-demo.tsx" />

`Attachment` 组件显示文件或图像附件及其媒体、名称和元数据，还可显示操作和上传状态。可在聊天输入框、消息线程和上传列表中用它展示文件和图像。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add attachment
```

</template>

<template #manual>

**1. 安装所需的 shadcn/ui 依赖：**

```bash
npx shadcn@latest add button
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/attachment.tsx [components/ui/attachment.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
```

```tsx
<Attachment>
  <AttachmentMedia>
    <FileTextIcon />
  </AttachmentMedia>
  <AttachmentContent>
    <AttachmentTitle>sales-dashboard.pdf</AttachmentTitle>
    <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
  </AttachmentContent>
  <AttachmentActions>
    <AttachmentAction aria-label="Remove sales-dashboard.pdf">
      <XIcon />
    </AttachmentAction>
  </AttachmentActions>
</Attachment>
```

## 结构 {#composition}

按以下结构组合附件：

```text
Attachment
├── AttachmentMedia
├── AttachmentContent
│   ├── AttachmentTitle
│   └── AttachmentDescription
├── AttachmentActions
│   └── AttachmentAction
└── AttachmentTrigger
```

使用 `AttachmentGroup` 将多个附件排成一行，支持滚动：

```text
AttachmentGroup
├── Attachment
└── Attachment
```

## 功能 {#features}

- 通过 `AttachmentMedia` 显示图标和图像
- 内置 `idle`、`uploading`、`processing`、`error` 和 `done` 上传状态的样式，进行中显示流光效果
- 支持三种尺寸，以及水平或垂直布局
- 覆盖整张卡片的 `AttachmentTrigger` 可打开链接或对话框，各个操作仍可单独点击
- `AttachmentGroup` 支持滚动、吸附和边缘渐隐
- 每个部分均可通过 `className` 属性自定义样式

## 图像 {#image}

在 `AttachmentMedia` 上设置 `variant="image"` 并在其中渲染 `<img>`。使用 `orientation="vertical"` 将媒体放在内容上方。

<demo react="shadcn-base/attachment-image.tsx" />

## 状态 {#states}

设置 `state` 表示上传进度。`uploading` 和 `processing` 会为标题加上流光效果，`error` 则会切换到错误样式。

<demo react="shadcn-base/attachment-states.tsx" />

## 尺寸 {#sizes}

使用 `size` 在 `default`、`sm` 和 `xs` 之间切换。

<demo react="shadcn-base/attachment-sizes.tsx" />

## 分组 {#group}

用 `AttachmentGroup` 包裹附件，即可将它们排成支持横向滚动、吸附和边缘渐隐的一行。

<demo react="shadcn-base/attachment-group.tsx" />

## 触发器 {#trigger}

添加 `AttachmentTrigger` 后，点击卡片任意位置即可打开链接或对话框。它覆盖卡片并位于操作元素下方，因此仍可点击各个操作。

<demo react="shadcn-base/attachment-trigger.tsx" />

```tsx:line-numbers
<Dialog>
  <Attachment>
    {/* media, content, actions */}
    <DialogTrigger
      render={<AttachmentTrigger aria-label="Preview research-summary.pdf" />}
    />
  </Attachment>
  <DialogContent>{/* ... */}</DialogContent>
</Dialog>
```

## 无障碍 {#accessibility}

`AttachmentAction` 渲染为 `Button`，`AttachmentTrigger` 渲染为原生 `<button>`（也可通过 `render` 使用自定义元素）。按照以下指引，让二者都可操作，也能被辅助技术播报。

### 为纯图标操作添加标签 {#label-icon-only-actions}

`AttachmentAction` 通常只显示图标，因此应为每个操作设置 `aria-label`，说明操作及其目标。

```tsx:line-numbers
<AttachmentAction aria-label="Remove sales-dashboard.pdf">
  <XIcon />
</AttachmentAction>
```

### 为触发器添加标签 {#label-the-trigger}

`AttachmentTrigger` 覆盖整张卡片，本身没有文字，因此应通过 `aria-label` 说明触发后的效果。

```tsx:line-numbers
<AttachmentTrigger
  render={
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open workspace.png"
    />
  }
/>
```

触发器的层叠顺序低于操作元素，因此 `AttachmentAction` 和 `AttachmentTrigger` 互不遮挡，两者仍可分别聚焦和点击。

### 键盘滚动 {#keyboard-scrolling}

`AttachmentGroup` 支持横向滚动。附件具有触发器或操作等交互时，键盘用户可通过 Tab 键聚焦屏幕外的条目。对于一排仅供展示的附件，请为组本身添加 `tabIndex={0}`、`role="group"` 和 `aria-label`，使其可聚焦和滚动。

### 用文字补充颜色信息 {#meaning-beyond-color}

`error` 状态使用错误颜色。请在 `AttachmentDescription` 中保留失败原因，让用户也能通过文字得知状态。

## API 参考 {#api-reference}

### Attachment {#attachment}

附件的根容器。

| 属性          | 类型                                                         | 默认值        | 说明                                       |
| ------------- | ------------------------------------------------------------ | -------------- | ------------------------------------------------- |
| `state`       | `"idle" \| "uploading" \| "processing" \| "error" \| "done"` | `"done"`       | 上传状态，决定样式和流光效果。 |
| `size`        | `"default" \| "sm" \| "xs"`                                  | `"default"`    | 附件尺寸。 |
| `orientation` | `"horizontal" \| "vertical"`                                 | `"horizontal"` | 将媒体放在内容旁边或上方。 |
| `className`   | `string`                                                     | -              | 应用于根元素的附加类。 |

### AttachmentMedia {#attachmentmedia}

用于图标或图像预览的媒体插槽。

| 属性        | 类型                | 默认值  | 说明                                    |
| ----------- | ------------------- | -------- | ---------------------------------------------- |
| `variant`   | `"icon" \| "image"` | `"icon"` | 媒体显示图标还是 `<img>`。 |
| `className` | `string`            | -        | 应用于媒体插槽的附加类。 |

### AttachmentContent {#attachmentcontent}

包裹标题和说明。

| 属性        | 类型     | 默认值 | 说明                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | -       | 应用于内容插槽的附加类。 |

### AttachmentTitle {#attachmenttitle}

附件名称。在附件处于 `uploading` 或 `processing` 状态时显示流光效果。

| 属性        | 类型     | 默认值 | 说明                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | -       | 应用于标题的附加类。 |

### AttachmentDescription {#attachmentdescription}

文件类型、大小或上传状态等辅助元数据。

| 属性        | 类型     | 默认值 | 说明                                     |
| ----------- | -------- | ------- | ----------------------------------------------- |
| `className` | `string` | -       | 应用于说明的附加类。 |

### AttachmentActions {#attachmentactions}

容纳一个或多个操作的容器，对齐到附件末端。

| 属性        | 类型     | 默认值 | 说明                                 |
| ----------- | -------- | ------- | ------------------------------------------- |
| `className` | `string` | -       | 应用于操作容器的附加类。 |

### AttachmentAction {#attachmentaction}

操作按钮。渲染为 [`Button`](https://ui.shadcn.com/docs/components/button)，并接受它的所有属性。

| 属性       | 类型                                  | 默认值     | 说明                              |
| ---------- | ------------------------------------- | ----------- | ---------------------------------------- |
| `size`     | `Button["size"]`                      | `"icon-xs"` | 按钮尺寸。 |
| `...props` | `React.ComponentProps<typeof Button>` | -           | 透传给底层 `Button` 的属性。 |

### AttachmentTrigger {#attachmenttrigger}

覆盖整张卡片，用于触发附件操作。默认渲染为 `<button>`。

| 属性       | 类型                             | 默认值 | 说明                                    |
| ---------- | -------------------------------- | ------- | ---------------------------------------------- |
| `render`   | `ReactElement \| function`       | -       | 渲染为其他元素，例如链接。 |
| `...props` | `React.ComponentProps<"button">` | -       | 透传给触发元素的属性。 |

### AttachmentGroup {#attachmentgroup}

将附件排成支持横向滚动和吸附的一行。

| 属性        | 类型     | 默认值 | 说明                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | -       | 应用于组的附加类。 |
