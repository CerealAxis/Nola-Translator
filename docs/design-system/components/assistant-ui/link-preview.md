---
title: Link preview（链接预览）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Link preview（链接预览）

用紧凑卡片显示链接标题和摘要，便于决定是否打开。

链接预览将工具返回的 URL 转换为可读的小卡片。它将目的地、标题、描述和图像保留在一起，而不会让整个文字记录感觉像浏览器一样。

<demo react="assistant-ui/link-preview-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-link-preview"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-link-preview.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

后端工具可以返回它解析的 URL 元数据。它的渲染器等待该结果，然后将字段直接传递给 `LinkPreview`。

### 渲染工具结果 {#render-a-tool-result}

```tsx
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { LinkPreview } from "@/components/assistant-ui/elements/link-preview";

type PreviewLinkResult = {
  href: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

export const PreviewLinkToolUI: ToolCallMessagePartComponent<
  Record<string, never>,
  PreviewLinkResult
> = ({ result }) => (result ? <LinkPreview {...result} /> : null);
```

### 注册后端工具 {#register-the-backend-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { PreviewLinkToolUI } from "@/components/assistant-ui/elements/preview-link-tool-ui";

export const toolkit = defineToolkit({
  preview_link: {
    type: "backend",
    render: PreviewLinkToolUI,
  },
});
```

   后端返回 `{ href, title, description, image, siteName }` 作为其工具结果。当不存在结果时，渲染器返回 `null`。

**独立版**

从你自己的获取器或 CMS 传递已解析的元数据。 `href` 是必需的，卡的其余部分是可选的。

### 渲染已解析的 URL {#render-a-resolved-url}

```tsx
import { LinkPreview } from "@/components/assistant-ui/elements/link-preview";

export function RelatedLink() {
  return (
    <LinkPreview
      href="https://react.dev/learn/you-might-not-need-an-effect"
      title="您可能不需要效果器"
      description="在达到效果之前在渲染期间导出值。"
      siteName="React"
    />
  );
}
```

## 结构 {#anatomy}

```tsx
<article data-slot="link-preview" data-layout="card | compact">
  <div data-slot="link-preview-image" />
  <div>
    <span>{/* favicon or site initial, then site name */}</span>
    <a>{/* title and an accessible new-tab label */}</a>
    <span>{/* description */}</span>
  </div>
</article>
```

默认的 `card` 布局将图像放在文本上方。 `compact` 将 64 像素缩略图移动到前缘。如果图像无法加载，其框架就会消失。提供的网站图标将取代网站方块的位置，否则卡片将使用网站名称或主机的第一个字母。

当 `href` 安全时，标题将在新选项卡中打开它，并且其命中目标覆盖该卡。不安全的 URL 会在没有链接的情况下呈现相同的信息。缺少 `title` 和 `siteName` 时，会回退到 URL 主机（当其中之一可用时）。

## 示例 {#examples}

### 布局紧凑 {#compact-layout}

当卡与其他链接共享密集答案时，请使用紧凑的形状。

```tsx
<LinkPreview
  href="https://react.dev/learn/you-might-not-need-an-effect"
  title="您可能不需要效果器"
  siteName="React"
  layout="compact"
/>
```

### 不安全 URL 行为 {#unsafe-url-behavior}

该组件永远不会将不安全的协议转换为链接。它仍然显示调用者提供的文本，因此记录可以保留工具结果而不暴露导航。

```tsx
<LinkPreview
  href="javascript:alert(1)"
  title="不可信结果"
  description="显示为纯元数据，没有链接。"
/>
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `result` | `{ href, title?, description?, image?, siteName? } \| undefined` | 后端解析的元数据。在它存在之前不渲染任何内容。 |
| `status` | `ToolCallMessagePartStatus` | 渲染器需要时的工具调用生命周期状态。 |
| `toolCallId` | `string` | 此工具调用的稳定 ID。 |

在后端工具的 `render` 字段上注册渲染器。有关完整的渲染属性列表，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### LinkPreview {#linkpreview}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | --------------------- | -------- | ----------------------------------------------------------- |
| `href` | `string` |  | 链接目标。不安全的值呈现静态内容。 |
| `title` | `string` | 主机 | 卡标题。 |
| `description` | `string` |  | 支持预览文本。 |
| `image` | `string` |  | 预览图像。如果加载失败，其框架将被移除。 |
| `imageAlt` | `string` | `""` | 预览图像的替代文本。 |
| `siteName` | `string` | 主机 | 网站图标或首字母旁边的站点标签。 |
| `favicon` | `string` |  | 16px 站点图标。失败的图标会退回到初始状态。 |
| `layout` | `"card" \| "compact"` | `"card"` | 正文上方的图像或前导 64 像素缩略图。 |
| `className` | `string` |  | 合并到根元素。 |

其余 `article` 属性会传给根元素。
