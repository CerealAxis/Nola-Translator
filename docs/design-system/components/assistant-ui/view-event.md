---
title: View event（查看日程）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# View event（查看日程）

紧凑的单条日程卡片显示日期、会议时间和地点。

<demo react="assistant-ui/view-event-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/view-event-demo.tsx#spec
