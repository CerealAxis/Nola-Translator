---
title: Create task（创建任务）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Create task（创建任务）

简短的任务表单收集标题、说明和截止日期，再提交创建动作。

<demo react="assistant-ui/create-task-demo.tsx" />

## 安装 {#installation}

```bash
npm install @assistant-ui/generative-ui zod
```

## 用法 {#usage}

将下方规格传给渲染器。提供 `dispatch` 可接收按钮或表单的动作载荷。演示只在本地显示操作反馈。

```tsx
import { defaultGenerativeUILibrary, renderGenerativeUI } from "@assistant-ui/generative-ui/react";

renderGenerativeUI(spec, defaultGenerativeUILibrary, {
  status: "done",
  dispatch: (action) => {
    // 将用户操作交给应用。
    console.log(action);
  },
});
```

## 规格 {#spec}

<<< @/media-src/vis/demos/assistant-ui/create-task-demo.tsx#spec
