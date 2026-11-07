---
title: Table reservation（餐桌预订）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Table reservation（餐桌预订）

餐桌预订表单收集姓名、人数、日期、座位偏好和提醒选项，并通过卡片的确认操作提交。

<demo react="assistant-ui/table-reservation-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/table-reservation-demo.tsx#spec
