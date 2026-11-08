---
title: Support tickets（支持工单）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Support tickets（支持工单）

用带坐标轴和图例的三序列堆叠柱状图，对比邮件、聊天和电话工单。

<demo react="assistant-ui/support-tickets-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/support-tickets-demo.tsx#spec
