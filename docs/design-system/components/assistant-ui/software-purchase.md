---
title: Software purchase（软件购买）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Software purchase（软件购买）

购买表单收集用途、日期、席位数和结算频率，并展示金额和确认操作。

<demo react="assistant-ui/software-purchase-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/software-purchase-demo.tsx#spec
