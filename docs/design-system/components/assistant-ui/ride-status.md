---
title: Ride status（行程状态）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Ride status（行程状态）

行程卡片突出预计抵达时间，并显示车辆、上车地点与司机信息。

<demo react="assistant-ui/ride-status-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/ride-status-demo.tsx#spec
