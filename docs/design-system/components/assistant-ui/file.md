---
title: File（文件）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# File（文件）

以简洁的行展示文件，包含文件名、类型与大小等信息。

<demo react="assistant-ui/file-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/file"
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

可以从消息中渲染文件，也可将文件信息直接传给组件。

### 渲染消息文件 {#render-files-from-a-message}

将文件组件注册到消息片段渲染器，组件读取文件片段。

```tsx
import { File } from "@/components/assistant-ui/elements/file";
import { MessagePrimitive } from "@assistant-ui/react";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ File }} />
    </MessagePrimitive.Root>
  );
}
```

### 直接渲染文件 {#render-a-file-directly}

传入文件名、媒体类型和文件地址，适合已有文件对象的界面。

```tsx
import { File } from "@/components/assistant-ui/elements/file";

export function Attachment() {
  return (
    <File
      type="file"
      filename="report.pdf"
      mimeType="application/pdf"
      data="https://example.com/report.pdf"
      sourceType="url"
      status={{ type: "complete" }}
    />
  );
}
```

## 结构 {#anatomy}

音视频文件可在行内播放器播放，文件名作为播放器标题。非媒体文件按 `mimeType` 选取图标。只有 base64 或 `data:` URI 等内联数据可推算字节数，普通 URL 或 ID 不显示大小。

```tsx
<div>
  <div data-slot="file-player">
    <div data-slot="audio-player | video-player" />
  </div>
  <div>
    <span data-slot="file-size" />
    <a data-slot="file-download" />
  </div>
</div>
```

## 示例 {#examples}

文件行可以根据列表密度设置尺寸，也可以调整展示区域。

### 变体与尺寸 {#variants-and-sizes}

给 `File.Root` 设置 `variant` 与 `size`。 `File` 本身使用默认值。变体包括 `outline`、`ghost`、`muted`，尺寸包括 `sm`、`default`、`lg`。

```tsx
<File.Root variant="muted" size="sm">
  <File.Icon mimeType={part.mimeType} />
  <File.Name>{part.filename}</File.Name>
</File.Root>
```

### 调整文件行样式 {#restyle-the-row}

用 `className` 改变布局或宽度，沿用原有文件信息和操作。

```tsx
import { File } from "@/components/assistant-ui/elements/file";

export function CustomFileRow() {
  return (
    <File.Root variant="ghost">
      <File.Icon mimeType={part.mimeType} />
      <File.Name>{part.filename}</File.Name>
      <File.Download
        data={part.data}
        mimeType={part.mimeType}
        filename={part.filename}
        sourceType={part.sourceType}
      />
    </File.Root>
  );
}

export function CustomMediaFile() {
  return (
    <File.Player
      data={part.data}
      mimeType={part.mimeType}
      filename={part.filename}
      sourceType={part.sourceType}
    />
  );
}
```

## API 参考 {#api-reference}

组件区分消息中的文件片段和独立的文件属性。

### File {#file}

将 `File` 绑定到 `MessagePrimitive.Parts` 的 `components.File`。可以分别组合 `File.Root`、`File.Icon`、`File.Name`、`File.Size`、`File.Download` 与 `File.Player`。下载需要从文件数据解析到安全地址，播放器仅渲染可播放的音视频。

### 文件片段 {#file-part}

文件片段的 `data` 可以是 base64、`data:` URI、URL 或 ID。 `sourceType` 可指定 `"url"` 或 `"id"`，省略时从数据形式推断。 `mimeType` 决定图标与内联数据类型，`filename` 为可选的显示名。

### File 属性 {#file-props}

独立 `File` 接收完整片段对象。`type` 必须是 `"file"`，`data` 和 `mimeType` 必填；`filename` 和 `sourceType` 可选。 `status` 来自片段类型，渲染时不会读取。 `variant` 和 `size` 属于 `File.Root`。
