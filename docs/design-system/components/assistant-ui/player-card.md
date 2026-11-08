---
title: Player card（选手卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Player card（选手卡片）

球员资料卡突出球员姓名和位置，下面排列四项比赛数据。

<demo react="assistant-ui/player-card-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/player-card-demo.tsx#spec
