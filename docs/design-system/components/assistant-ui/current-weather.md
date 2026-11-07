---
title: Current weather（当前天气）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Current weather（当前天气）

天气卡片突出当前温度，并提供天气状况和体感温度。

<demo react="assistant-ui/current-weather-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/current-weather-demo.tsx#spec
