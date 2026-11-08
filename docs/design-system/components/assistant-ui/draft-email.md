---
title: Draft email（邮件草稿）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Draft email（邮件草稿）

邮件表单显示发件人，并收集收件人、主题和正文。发送按钮提交填写的数据。

<demo react="assistant-ui/draft-email-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/draft-email-demo.tsx#spec
