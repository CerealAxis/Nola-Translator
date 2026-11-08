---
title: Attachment（附件）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Attachment（附件）

在输入区和已发送消息里显示文件或图片附件，并提供预览、移除和添加入口。

<demo react="assistant-ui/attachment-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/attachment"
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

附件适配器处理上传和读取；附件组件负责显示对应状态。

### 在输入区渲染附件 {#render-attachments-in-the-composer}

将预览项绑定到 `ComposerPrimitive.Attachments`，在发送之前查看或移除附件。

```tsx
import { ComposerPrimitive } from "@assistant-ui/react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/elements/attachment.aui";

function Composer() {
  return (
    <ComposerPrimitive.Root>
      <ComposerPrimitive.AttachmentDropzone>
        <ComposerAttachments />
        <ComposerPrimitive.Input placeholder="发送消息…" />
        <ComposerAddAttachment />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
}
```

### 在已发送消息上渲染附件 {#render-attachments-on-a-sent-message}

用 `MessagePrimitive.Attachments` 遍历当前消息的附件。发送后应展示可读的文件详情。

```tsx
import { MessagePrimitive } from "@assistant-ui/react";
import { UserMessageAttachments } from "@/components/assistant-ui/elements/attachment.aui";

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <UserMessageAttachments />
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
```

## 结构 {#anatomy}

一组附件包含缩略图或文件图标、名称和详情；输入区可以增加移除按钮和文件选择器。

```tsx
<div> {/* AttachmentPrimitive.Root */}
  <div
    role={hasPreview ? "button" : "group"}
    tabIndex={0}
    aria-label={hasPreview
      ? `Preview ${filename}${uploadStateSuffix}`
      : `${type} attachment ${filename}${uploadStateSuffix}`}
  >
    {/* thumbnail: the image itself, or a file icon fallback */}
    {/* uploading: a blurred spinner overlay */}
    {/* error: a blurred alert overlay */}
  </div>
  {/* uploadStateSuffix is "", ", uploading", or ", upload failed". */}
  <button aria-label="移除示例.png">{/* composer only */}</button>
</div>
```

## 示例 {#examples}

同一类文件在草稿与已发送消息中可以采用不同操作。

### 输入区与消息附件 {#composer-vs-message-attachments}

草稿支持移除，发送后的消息通常只保留查看能力。

```tsx
<ComposerAttachments />       {/* ComposerPrimitive.Attachments, source: "composer" */}
<UserMessageAttachments />    {/* MessagePrimitive.Attachments, source: "message" */}
```

### 读取解析后的预览地址 {#reading-the-resolved-preview-source}

使用附件上下文和预览辅助函数获得真正可显示的图片地址，处理本地和已上传文件。

```tsx
import { useAttachmentSrc } from "@/hooks/use-attachment-src";

function CustomThumb() {
  const src = useAttachmentSrc();
  if (!src) return <FileIcon />;
  return <img src={src} alt="" />;
}
```

### 添加附件选择器 {#add-attachment-picker}

将 `ComposerPrimitive.AddAttachment` 放进输入区。选择文件后，由附件适配器接管。

```tsx
<ComposerAddAttachment />
```

## API 参考 {#api-reference}

预设附件使用 assistant-ui 的底层附件 primitive，应用也可替换单项。

### 套件组件 {#kit-parts}

分别使用输入区附件、已发送附件和添加附件按钮。

### 底层 primitive {#primitives-composed}

`ComposerPrimitive.Attachments`、`MessagePrimitive.Attachments` 与 `AttachmentPrimitive` 提供遍历、读取和操作能力。

### 附件状态 {#attachment-state}

包含文件名称、类型、内容和处理进度；等待上传或出错时可显示相应状态。

## 收到的文件 {#the-received-files-design}

以列表方式集中展示消息收到的文件，方便扫描名称和大小。

```sh
npx shadcn@latest add "@assistant-ui/elements-message-attachment"
```

```tsx
"use client";

import { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  MessageAttachments,
  type MessageAttachmentItem,
} from "@/components/assistant-ui/elements/message-attachment";

function UserReceivedFiles() {
  const attachments = useAuiState((s) => s.message.attachments);
  const items = useMemo<MessageAttachmentItem[]>(
    () =>
      attachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: formatFileSize(a),
        kind: a.type === "image" || a.type === "document" ? a.type : "file",
      })),
    [attachments],
  );

  if (items.length === 0) return null;
  return (
    <MessageAttachments attachments={items} onOpen={(id) => openViewer(id)} />
  );
}
```

```tsx
"use client";

import {
  MessageAttachments,
  type MessageAttachmentItem,
} from "@/components/assistant-ui/elements/message-attachment";

const attachments: MessageAttachmentItem[] = [
  { id: "1", name: "diagram.png", size: "1.2 MB", kind: "image", swatch: "url(/diagram-thumb.png)" },
  { id: "2", name: "spec.pdf", size: "340 KB", kind: "document", pages: 12 },
];

export function ReceivedFiles() {
  return (
    <MessageAttachments attachments={attachments} onOpen={(id) => openViewer(id)} />
  );
}
```

### MessageAttachments {#messageattachments}

接收 `attachments: readonly MessageAttachmentItem[]`，按顺序显示收到的文件。 `onOpen(id)` 可处理点击，省略时文件只显示详情。 `className` 添加到根节点。
