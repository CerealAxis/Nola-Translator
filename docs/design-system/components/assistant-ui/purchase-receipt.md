---
title: Purchase receipt（购买收据）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Purchase receipt（购买收据）

购买收据用状态徽标提示完成，并列出商品、数量、预计送达时间和付款信息。

<demo react="assistant-ui/purchase-receipt-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/purchase-receipt-demo.tsx#spec
