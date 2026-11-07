---
title: Flight tracker（航班追踪）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Flight tracker（航班追踪）

航班卡片显示出发地、目的地、准点状态、航程进度和预计剩余时间。

<demo react="assistant-ui/flight-tracker-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/flight-tracker-demo.tsx#spec
