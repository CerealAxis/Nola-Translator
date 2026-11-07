---
title: Portfolio overview（投资组合概览）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Portfolio overview（投资组合概览）

投资组合卡片结合关键数字、带坐标轴的柱状图和持仓表格。

<demo react="assistant-ui/portfolio-overview-demo.tsx" />

## 安装 {#installation}

```bash
npm install @assistant-ui/generative-ui zod
```

## 用法 {#usage}

将下方规格传给渲染器。此规格包含完整的展示数据，渲染时使用已完成状态。

```tsx
import { defaultGenerativeUILibrary, renderGenerativeUI } from "@assistant-ui/generative-ui/react";

renderGenerativeUI(spec, defaultGenerativeUILibrary, { status: "done" });
```

## 规格 {#spec}

<<< @/media-src/vis/demos/assistant-ui/portfolio-overview-demo.tsx#spec
