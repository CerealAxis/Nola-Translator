---
title: Weekly active users（周活跃用户）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Weekly active users（周活跃用户）

用带坐标轴和图例的双序列堆叠面积图，对比新用户和回访用户。

<demo react="assistant-ui/weekly-active-users-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/weekly-active-users-demo.tsx#spec
