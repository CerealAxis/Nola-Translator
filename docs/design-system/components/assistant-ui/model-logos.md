---
title: Model logos（模型标志）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Model logos（模型标志）

为模型选项提供供应商的 SVG 标志，也可单独渲染这些标志。

<demo react="assistant-ui/model-logos-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/logos"
```

## 快速开始 {#getting-started}

将标志传给模型选择器，或直接把 SVG 组件放进应用界面。

### 为每个模型选项添加标志 {#attach-a-logo-to-each-model-option}

使用 `ModelOption.icon` 放入供应商标志组件。

```tsx
import { ClaudeLogo, OpenAILogo, GeminiLogo } from "@/components/assistant-ui/elements/logos";
import type { ModelOption } from "@/components/assistant-ui/elements/model-selector";

export const models: ModelOption[] = [
  { id: "claude-sonnet-5", name: "Sonnet 5", icon: <ClaudeLogo className="size-4" /> },
  { id: "gpt-6-luna", name: "GPT-6", icon: <OpenAILogo className="size-4" /> },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", icon: <GeminiLogo className="size-4" /> },
];
```

### 独立渲染标志 {#render-a-mark}

可在其他界面直接使用 Claude、OpenAI 和 Gemini 的标志组件。

```tsx
import { ClaudeLogo, OpenAILogo, GeminiLogo } from "@/components/assistant-ui/elements/logos";

export function Providers() {
  return (
    <div className="flex items-center gap-3">
      <OpenAILogo className="size-6" />
      <ClaudeLogo className="size-6" />
      <GeminiLogo className="size-6" />
    </div>
  );
}
```

## 示例 {#examples}

标志可以继承周围文本的颜色，也可以按标准 SVG 属性定制。

### 调整颜色 {#recoloring}

通过文字颜色或 SVG 颜色属性改变标志，具体取决于该标志的填充方式。

```tsx
<OpenAILogo className="size-5 text-foreground/60" />
```

### 保留 SVG 属性 {#every-prop-svg-takes-still-works}

可以传入常规 SVG 属性，例如宽高、类名和无障碍名称。

```tsx
<ClaudeLogo width={20} height={20} aria-hidden={false} role="img" />
```

## API 参考 {#api-reference}

可用模型元数据关联标志，也可以直接使用组件。

### ModelOption {#modeloption}

`icon` 接收 React 节点，选择器会在相关位置显示它。

### ClaudeLogo、OpenAILogo 和 GeminiLogo {#claudelogo-openailogo-geminilogo}

每个组件均透传标准 SVG 属性。
