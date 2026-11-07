---
title: Image（图片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Image（图片）

显示消息里的图像，也可独立预览图像或标记生成来源。

<demo react="assistant-ui/image-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/image"
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

从消息图片片段渲染，或直接传入现有图片地址。

### 渲染消息图片 {#render-images-from-a-message}

在 `MessagePrimitive.Parts` 注册图像渲染器，使用当前片段的图像信息。

```tsx
import { Image } from "@/components/assistant-ui/elements/image";
import { MessagePrimitive } from "@assistant-ui/react";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Image }} />
    </MessagePrimitive.Root>
  );
}
```

### 直接渲染图像 {#render-an-image-directly}

独立 `Image` 接收完整图片片段。 `type` 为 `"image"`，URL 或 data URI 传给 `image`，可提供 `filename` 和 `status`。

```tsx
import { Image } from "@/components/assistant-ui/elements/image";

export function Picture() {
  return (
    <Image
      type="image"
      image="https://example.com/photo.png"
      filename="photo.png"
      status={{ type: "complete" }}
    />
  );
}
```

## 结构 {#anatomy}

`status.type === "running"` 时显示生成占位。因 `content-filter` 中断时显示拦截提示，其余情况显示图像。预览支持点击、Enter 或 Space 放大，使用 Escape 或点击外部关闭。来源和操作按钮可以另外组合。

```tsx
<div data-slot="image-root" data-variant={variant} data-size={size}>
  {/* status.type === "running": */}
  <div data-slot="image-generating" />

  {/* status.type === "incomplete" && status.reason === "content-filter": */}
  <div data-slot="image-content-filter-error" />

  {/* otherwise: */}
  <div className="aui-image-zoom-trigger" role="button" aria-label="点击放大图像">
    <div data-slot="image-preview">
      <div data-slot="image-preview-loading" /> {/* until loaded or errored */}
      <img /> {/* or, on error: */}
      <div data-slot="image-preview-error" />
    </div>
  </div>
  <span data-slot="image-filename" /> {/* omitted when there is no filename */}
  <div data-slot="image-source" /> {/* optional attribution footer */}
</div>
```

## 示例 {#examples}

为图片补充生成来源，并按需要接入下载、复制或重新生成。

### 标明工具结果来源 {#attribute-a-tool-result}

在图像旁使用 `ImageSource` 显示产生它的工具或模型。

```tsx
import { Image } from "@/components/assistant-ui/elements/image";

type ImageToolResult = {
  imageUrl: string;
  source: {
    label?: string;
    url?: string;
    iconUrl?: string;
  };
};

function ToolImage({ imageUrl, source }: ImageToolResult) {
  return (
    <Image.Root>
      <Image.Zoom src={imageUrl}>
        <Image.Preview src={imageUrl} ratio="16:9" fit="cover" />
      </Image.Zoom>
      <Image.Source {...source} />
    </Image.Root>
  );
}
```

### 添加下载、复制和重新生成操作 {#add-download-copy-and-regenerate-actions}

把操作放在图像附近，回调由应用接入文件或模型逻辑。

```tsx
import { Image } from "@/components/assistant-ui/elements/image";

function ImageWithActions(part: React.ComponentProps<typeof Image>) {
  return (
    <Image.Root>
      <Image.Zoom src={part.image}>
        <Image.Preview src={part.image} />
      </Image.Zoom>
      <Image.Actions part={part} onRegenerate={() => refetchImage(part)} />
    </Image.Root>
  );
}
```

### 变体与尺寸 {#variants-and-sizes}

变体和尺寸设置在 `Image.Root`。变体包括默认的 `outline`、无边框的 `ghost` 和加载时使用弱化背景的 `muted`。 `sm`、`default`、`lg`、`full` 分别对应 16rem、24rem、32rem 和容器全宽。

```tsx
<Image.Root variant="ghost" size="lg">
  <Image.Preview src={part.image} />
</Image.Root>
```

## API 参考 {#api-reference}

图像的直接渲染、预览和来源可以分别使用。

### Image {#image}

作为消息渲染器时，将 `Image` 传给 `MessagePrimitive.Parts` 的 `components.Image`。其组合节点包括 `Root`、`Preview`、`Zoom`、`Filename`、`Source`、`Generating`、`ContentFilterError` 与 `Actions`。

### 图像片段 {#image-part}

图片消息提供图像地址或嵌入数据。渲染器在对应的消息上下文中获取它们。

### Image 属性 {#image-props}

`type` 为 `"image"`，`image` 为图片 URL 或 data URI，`filename` 和 `status` 来自图片片段。需要直接提供 `src` 与 `alt` 时，使用 `Image.Preview`。

### ImagePreview {#imagepreview}

接受 `src`、`alt`、`ratio` 和 `fit`，并为加载中和加载失败提供不同状态。

### ImageSource {#imagesource}

用简短文字标明图片的工具、模型或其他来源。
