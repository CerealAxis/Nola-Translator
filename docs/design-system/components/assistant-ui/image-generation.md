---
title: Image generation（图像生成）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Image generation（图像生成）

在图像生成时显示网格占位，再逐步呈现清晰结果。

图像生成保留尚未到达的图像的框架：生成时在模糊梯度上的脉冲点网格，一旦完成就稳定为锐利梯度。通过运行时，它可以跟踪工具调用的状态。独立的你自己驱动`prompt`和`generating`。

<demo react="assistant-ui/image-generation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-image-generation"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-image-generation.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

图像工具通过该工具自己的工具包条目进行渲染：模型的提示作为 `args` 到达，调用的生命周期作为 `status`。

### 定义图像工具包 {#define-the-image-toolkit}

```tsx
"use generative";

import { defineToolkit, externalTool } from "@assistant-ui/react";
import { ImageGeneration } from "@/components/assistant-ui/elements/image-generation";

export default defineToolkit({
  generate_image: {
    execute: externalTool(),
    render: ({ args, status }) => (
      <ImageGeneration
        prompt={args.prompt ?? ""}
        generating={status.type === "running"}
      />
    ),
  },
});
```

   `execute: externalTool()` 标记后端路由或图像提供程序运行的工具，而不是浏览器：编译器将其从客户端捆绑包中删除并仅保留 `render`。

### 注册工具包 {#register-the-toolkit}

```tsx
"use client";

import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import toolkit from "./toolkit";

export function App() {
  const runtime = useChatRuntime();
  const config = AuiConfig({ tools: Tools({ toolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

   现在，会话中的每个 `generate_image` 工具调用都会呈现为此元素，无论 `MessagePrimitive.Parts` 将其放置在助手的回复中的何处。

**独立版**

独立版中，`ImageGeneration` 完全受控：你按住提示并确定生成是否正在进行，并可选择处理再生。

### 保持生成状态 {#hold-the-generation-state}

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageGeneration } from "@/components/assistant-ui/elements/image-generation";

export function Generation() {
  const prompt = "A calm mountain lake at dawn";
  const [generating, setGenerating] = useState(true);

  return (
    <ImageGeneration prompt={prompt} generating={generating} />
  );
}
```

### 生成完成后将其关闭 {#flip-it-off-once-generation-finishes}

   `ImageGeneration` 永远不会收到生成的 URL，因此单独保存它，并在到达后交换到真实的图像渲染器。在结果旁边保持再生可用：

```tsx
const [imageUrl, setImageUrl] = useState<string | null>(null);

const regenerate = useCallback(async () => {
  setGenerating(true);

  try {
    const url = await generateImage(prompt);
    setImageUrl(url);
  } finally {
    setGenerating(false);
  }
}, [prompt]);

useEffect(() => {
  void regenerate();
}, [regenerate]);

return imageUrl && !generating ? (
  <figure>
    <img src={imageUrl} alt={prompt} />
    <figcaption>
      <span>{prompt}</span>
      <button type="button" onClick={() => void regenerate()}>
        重新生成图像
      </button>
    </figcaption>
  </figure>
) : (
  <ImageGeneration prompt={prompt} generating={generating} />
);
```

## 结构 {#anatomy}

```tsx
<div data-slot="image-generation">
  <div>
    {/* the frame: an 8x8 pulsing dot grid, over a fixed decorative gradient */}
    <span>{/* "1024 × 1024" */}</span>
  </div>
  <div>
    <p>{/* prompt, or a shimmering "Generating" label while generating */}</p>
    {onRegenerate && (
      <button aria-label="重新生成图像" disabled={generating} />
    )}
  </div>
</div>
```

框架永远不会渲染实际生成的图像：点网格后面的渐变是源中的固定装饰图形，存在于两种状态中，并且仅在 `generating` 翻转时改变其模糊和不透明度。此元素中的任何内容都不接受图像 URL。一旦工具调用解析为真实的工具调用，将其交给渲染器来解析。请参阅 [Image](./image) 元素。当 `generating` 为 true 时，点网格的 64 点脉冲具有交错延迟，一旦为 false，则淡入完全透明。仅当提供 `onRegenerate` 时，才会呈现重新生成按钮。生成时，它会淡出、被禁用，并且对辅助技术隐藏，直到它可以再次运行。

## 示例 {#examples}

### 处理重新生成 {#handle-regeneration}

通过 `onRegenerate` 显示按钮并重新启动生成流程：

```tsx
<ImageGeneration
  prompt={prompt}
  generating={generating}
  onRegenerate={() => void regenerate()}
/>
```

### 调整框架 {#restyle-the-frame}

两种用法都支持通过 `className` 调整根元素。 “1024×1024”标签和提示行使用`surfaces.tsx`中的`mono`和`ShimmerLabel`。

```tsx
<ImageGeneration className="w-64" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具渲染属性 {#tool-render-props}

| 属性 | 类型 | 说明 |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `args` | `{ prompt?: string }` | 模型提供的参数。流式传输时部分。 |
| `status.type` | `"running" \| "complete" \| "incomplete" \| "requires-action"` | 调用的生命周期。 `"running"` 是唯一应该显示生成点的状态。 |

有关完整的工具调用片段形状，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### ImageGeneration {#imagegeneration}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `prompt` | `string` |  | 生成完成后显示在框架下方。 |
| `generating` | `boolean` |  | 如果为 true，则显示脉冲点网格和闪烁的“生成”标签来代替提示，并隐藏渐变。 |
| `onRegenerate` | `() => void` |  | 渲染重新生成按钮并在激活时运行。生成时该按钮被禁用。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `div` 属性会传给根元素。
