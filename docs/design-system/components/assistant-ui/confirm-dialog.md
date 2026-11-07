---
title: Confirm dialog（确认对话框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Confirm dialog（确认对话框）

紧凑的确认卡片提示删除不可撤销，并提供确认和取消两项操作。

<demo react="assistant-ui/confirm-dialog-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/confirm-dialog-demo.tsx#spec
