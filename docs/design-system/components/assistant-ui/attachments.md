---
title: Attachments（附件列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Attachments（附件列表）

把文件加入草稿，显示上传状态，并允许移除。

<demo react="assistant-ui/attachments-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-composer"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-composer.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 配置附件适配器

为运行时配置 attachment adapter，声明支持的文件并实现加入、发送和移除。

```tsx
import { useLocalRuntime, CompositeAttachmentAdapter, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter } from "@assistant-ui/react";

const runtime = useLocalRuntime(chatModel, {
  adapters: {
    attachments: new CompositeAttachmentAdapter([
      new SimpleImageAttachmentAdapter(),
      new SimpleTextAttachmentAdapter(),
    ]),
  },
});
```

### 添加并列出附件

使用 `ComposerPrimitive.AddAttachment` 与 `ComposerPrimitive.Attachments`，并用 `AttachmentPrimitive` 显示单个附件。

```tsx
"use client";

import { ComposerPrimitive, AttachmentPrimitive } from "@assistant-ui/react";
import { PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, ghostButton } from "@/components/assistant-ui/elements/surfaces";

export function ComposerAttachmentsRow() {
  return (
    <ComposerPrimitive.Attachments>
      {({ attachment }) => (
        <AttachmentPrimitive.Root
          className={cn(field, "flex items-center gap-2.5 rounded-[14px] py-1.5 ps-1.5 pe-2.5")}
        >
          <span className="max-w-36 truncate text-xs font-medium">
            <AttachmentPrimitive.Name />
          </span>
          {attachment.status.type !== "running" && (
            <AttachmentPrimitive.Remove aria-label={`Remove ${attachment.name}`} className={cn(ghostButton, "size-5")}>
              <XIcon className="size-3" />
            </AttachmentPrimitive.Remove>
          )}
        </AttachmentPrimitive.Root>
      )}
    </ComposerPrimitive.Attachments>
  );
}

export function AddAttachmentButton() {
  return (
    <ComposerPrimitive.AddAttachment aria-label="添加附件" className={cn(ghostButton, "size-8")}>
      <PlusIcon className="size-4" />
    </ComposerPrimitive.AddAttachment>
  );
}
```

### 启用拖放

用运行时的附件拖放组件接受拖入的文件。

```tsx
<ComposerPrimitive.AttachmentDropzone className="data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-500/[0.04]">
  {/* 显示对应条目 */}
</ComposerPrimitive.AttachmentDropzone>
```

**独立使用**

### 保存附件列表

独立版持有附件列表，给每项记录 ID、名称和上传状态。

```tsx
"use client";

import { useState } from "react";
import { ComposerAttachments, ComposerAttachmentChip, type ComposerAttachment } from "@/components/assistant-ui/elements/composer";

export function ChatBox() {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);

  const remove = (name: string) =>
    setAttachments((prev) => prev.filter((a) => a.name !== name));

  return (
    <ComposerAttachments>
      {attachments.map((attachment) => (
        <ComposerAttachmentChip key={attachment.name} attachment={attachment} onRemove={remove} />
      ))}
    </ComposerAttachments>
  );
}
```

### 处理文件上传

连接自己的文件上传逻辑。根据上传状态更新进度，并处理失败或移除。

```tsx
async function upload(file: File) {
  const attachment: ComposerAttachment = { name: file.name, meta: "0%", state: "uploading", progress: 0, kind: "image" };
  setAttachments((prev) => [...prev, attachment]);

  await uploadWithProgress(file, (progress) =>
    setAttachments((prev) => prev.map((a) => (a.name === file.name ? { ...a, progress, meta: `${progress}%` } : a))),
  );

  setAttachments((prev) => prev.map((a) => (a.name === file.name ? { ...a, state: "done", meta: formatSize(file.size) } : a)));
}
```

## 结构 {#anatomy}

附件区由可选图标、文件名、进度和移除操作组成，也能用于消息里的只读附件。

```tsx
<div data-slot="composer-attachment" data-state={/* 显示加载状态 */}>
  <span>{/* 对应槽位内容 */}</span>
  <span>
    <span>{/* 显示名称或标题 */}</span>
    <span>{/* 显示对应状态 */}</span>
  </span>
  <span>{/* 对应槽位内容 */}</span>
  {/* 显示加载状态 */}
</div>
```

上传时显示加载动画。上传完成时，提供 `onRemove` 就显示移除按钮，否则显示完成标记。错误状态只显示说明，重试由应用实现。

## 示例 {#examples}

### 上传进度

更新对应附件的进度字段，上传完成后改为可用状态。

**使用运行时**

```tsx
const status = useAuiState((s) => s.attachment.status);
// 显示加载状态
// 应用侧处理
```

**独立使用**

```tsx
<ComposerAttachmentChip attachment={{ name: "photo.png", meta: "1.2 MB", state: "uploading", progress: 62, kind: "image" }} />
```

### 调整附件标签样式

为附件区域或标签传 `className`。

```tsx
<AttachmentPrimitive.Root className="rounded-2xl py-2" />
```

### 消息发送后

草稿附件随消息发送后由消息附件组件展示。移除入口留在草稿里。

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive

| 组成部分 | Renders | 说明 |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Attachments` | render prop | 遍历编辑器里的附件。 |
| `AttachmentByIndex` | wrapper | 按索引读取当前附件。 |
| `AddAttachment` | `button` | 打开选择文件的入口。 |
| `AttachmentDropzone` | `div` (or `asChild`) | 将拖入的文件交给附件适配器。 |

### AttachmentPrimitive

| 组成部分 | Renders | 说明 |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Root` | `div` | 建立相应组件的上下文并包住其子组件。 |
| `Name` | text | 显示附件的文件名。 |
| `Remove` | `button` | 移除当前草稿里的附件。 |
| `unstable_Thumb` | `div` | 呈现可用的附件缩略图。 |

### 编辑器与附件状态

| 选择器 | 类型 | 说明 |
| ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `s.composer.attachments` | `readonly Attachment[]` | 草稿附件列表。 |
| `s.composer.attachmentAccept` | `string` | 附件适配器支持的文件类型。 |
| `s.thread.capabilities.attachments` | `boolean` | 当前会话是否支持附件。 |
| `s.attachment.name` / `.type` / `.contentType?` | `string` | 附件名称、类型及可选的内容类型。 |
| `s.attachment.status` | `PendingAttachmentStatus \| CompleteAttachmentStatus` | 当前附件的处理状态。 |
| `aui.composer.addAttachment(file)` | `(file: File \| CreateAttachment) => Promise<void>` | 向草稿添加文件。 |
| `aui.composer.clearAttachments()` | `() => Promise<void>` | 清空草稿附件。 |

`PendingAttachmentStatus` 包含上传中 `{ type: "running", reason: "uploading", progress: number }`、上传完成等待发送 `{ type: "requires-action", reason: "composer-send" }`、以及出错或暂停 `{ type: "incomplete", reason: "error" \| "upload-paused", message?: string }`。发送后的 `CompleteAttachmentStatus` 为 `{ type: "complete" }`。

**独立使用**

### ComposerAttachment

| 字段 | 类型 | 说明 |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `meta` | `string` | 补充信息。 |
| `state` | `"uploading" \| "done" \| "error"` | 当前展示状态，决定图标及可用操作。 |
| `progress` | `number` | 当前进度。 |
| `kind` | `"image" \| "text" \| "archive"` | 文件类型，决定显示的图标。 |

### ComposerAttachments / ComposerAttachmentChip

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `attachment` | `ComposerAttachment` | 必填 | 当前附件。 |
| `onRemove` | `(name: string) => void` |  | 移除附件时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |
