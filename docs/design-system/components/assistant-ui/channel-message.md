---
title: Channel message（频道消息）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Channel message（频道消息）

频道消息卡片组合频道名、时间、作者头像与 Markdown 正文。

<demo react="assistant-ui/channel-message-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/channel-message-demo.tsx#spec
