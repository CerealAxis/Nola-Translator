---
title: Media player（媒体播放器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Media player（媒体播放器）

在消息或页面中播放文件和媒体链接。

媒体播放器在对话中保留响应的录音或剪辑，具有明确的控制，并且不自动播放。

<demo react="assistant-ui/media-player-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-media-player"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-media-player.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`File` 将可播放的 `audio/*` 和 `video/*` 文件部分自动转入匹配的播放器中。将它们保留为文件部分，以便运行时为每个适配器保留相同的电线形状。

### 渲染媒体文件部分 {#render-media-file-parts}

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

   带有 `https:`、`blob:`、`data:` 或 base64 有效负载的 `audio/mpeg` 或 `video/mp4` 文件现在可以正常播放并保持其下载操作。

### 从后端工具返回音频 URL {#return-an-audio-url-from-a-backend-tool}

```tsx
export const createBriefingTool = {
  execute: async () => ({
    audioUrl: await createBriefingAudio(),
  }),
};
```

   当助手报告结果时，将 URL 作为文件部分发送回来：

```ts
{
  type: "file",
  filename: "briefing.mp3",
  mimeType: "audio/mpeg",
  data: audioUrl,
  sourceType: "url",
}
```

**独立版**

当 URL 已经是应用程序状态的一部分时，直接使用任一播放器。

### 播放录音或剪辑 {#play-a-recording-or-a-clip}

```tsx
import {
  AudioPlayer,
  VideoPlayer,
} from "@/components/assistant-ui/elements/media-player";

<AudioPlayer
  src="https://cdn.example.com/briefing.mp3"
  title="Daily briefing"
  durationMs={64_000}
/>

<VideoPlayer
  src="https://cdn.example.com/overview.mp4"
  title="Overview"
  ratio="16:9"
/>
```

## 结构 {#anatomy}

```tsx
<div data-slot="audio-player">
  <button aria-label="Play audio" />
  <input type="range" aria-label="Seek" />
  <audio preload="metadata" />
</div>

<div data-slot="video-player">
  <video controls playsInline preload="metadata" />
</div>
```

音频在浏览器拥有元数据时使用元数据持续时间，然后回退到 `durationMs`。它的寻道控制向辅助技术报告当前位置和总持续时间。视频将播放控制权留给浏览器，并在已知的情况下在帧下方显示标题和持续时间。

## 示例 {#examples}

### 音频封面 {#audio-artwork}

`artwork` 在不改变播放控件的情况下添加了 40px 封面图像：

```tsx
<AudioPlayer
  src={episode.url}
  title={episode.title}
  artwork={episode.coverUrl}
  durationMs={episode.durationMs}
/>
```

### 视频画面 {#video-framing}

`ratio` 默认为 `"16:9"`。对于固定帧，选择 `"4:3"`、`"1:1"` 或 `"9:16"`。当视频应自行调整大小时，选择 `"auto"`：

```tsx
<VideoPlayer src={clip.url} title={clip.title} ratio="9:16" />
```

## API 参考 {#api-reference}

**运行时版**

### AudioPlayer {#audioplayer}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | -------- | -------- | --------------------------------------- |
| `src` | `string` |  | 音频 URL 或数据 URI。 |
| `title` | `string` |  | 播放器和播放按钮的标签。 |
| `artwork` | `string` |  | 可选 40 像素封面图片 URL。 |
| `durationMs` | `number` |  | 元数据加载之前的回退持续时间。 |

### VideoPlayer {#videoplayer}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ---------------------------------------------- | -------- | ---------------------------------------------- |
| `src` | `string` |  | 视频 URL 或数据 URI。 |
| `poster` | `string` |  | 原生视频元素的海报图像 URL。 |
| `title` | `string` |  | 标题和可访问的视频标签。 |
| `ratio` | `"16:9" \| "4:3" \| "1:1" \| "9:16" \| "auto"` | `"16:9"` | 框架长宽比。 |
| `durationMs` | `number` |  | 元数据加载之前的回退持续时间。 |

**独立版**

### 音频播放器属性 {#audioplayer-props}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | -------- | -------- | --------------------------------------- |
| `src` | `string` |  | 音频 URL 或数据 URI。 |
| `title` | `string` |  | 播放器和播放按钮的标签。 |
| `artwork` | `string` |  | 可选 40 像素封面图片 URL。 |
| `durationMs` | `number` |  | 元数据加载之前的回退持续时间。 |

### 视频播放器属性 {#videoplayer-props}

| 属性 | 类型 | 默认值 | 说明 |
| ------------ | ---------------------------------------------- | -------- | ---------------------------------------------- |
| `src` | `string` |  | 视频 URL 或数据 URI。 |
| `poster` | `string` |  | 原生视频元素的海报图像 URL。 |
| `title` | `string` |  | 标题和可访问的视频标签。 |
| `ratio` | `"16:9" \| "4:3" \| "1:1" \| "9:16" \| "auto"` | `"16:9"` | 框架长宽比。 |
| `durationMs` | `number` |  | 元数据加载之前的回退持续时间。 |

所有其他 `div` 属性都转发到每个玩家根。
