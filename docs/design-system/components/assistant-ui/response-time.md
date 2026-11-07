---
title: Response time（响应时间）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Response time（响应时间）

用带坐标轴的单序列折线图展示全天的 p50 响应时间。

<demo react="assistant-ui/response-time-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/response-time-demo.tsx#spec
