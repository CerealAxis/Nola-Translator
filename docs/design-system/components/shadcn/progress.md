---
title: Progress（进度条）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Progress（进度条）

显示任务的完成进度，通常以进度条呈现。

<demo react="shadcn-base/progress-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add progress
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/progress.tsx [components/ui/progress.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Progress } from "@/components/ui/progress"
```

```tsx:line-numbers
<Progress value={33} />
```

## 组件结构 {#composition}

### 带标签和数值 {#with-label-and-value}

使用 `ProgressLabel` 和 `ProgressValue` 添加标签并显示数值。

```tsx:line-numbers
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"

;<Progress value={56} className="w-full max-w-sm">
  <ProgressLabel>Upload progress</ProgressLabel>
  <ProgressValue />
</Progress>
```

```text
Progress
├── ProgressLabel
├── ProgressValue
└── ProgressTrack
    └── ProgressIndicator
```

## 标签 {#label}

使用 `ProgressLabel` 和 `ProgressValue` 添加标签并显示数值。

<demo react="shadcn-base/progress-label.tsx" />

## 受控 {#controlled}

可以通过滑块控制的进度条。

<demo react="shadcn-base/progress-controlled.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/progress-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Progress](https://base-ui.com/react/components/progress#api-reference) 文档。
