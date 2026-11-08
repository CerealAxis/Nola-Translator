---
title: Riverside Loft（河畔阁楼）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Riverside Loft（河畔阁楼）

住宿卡片组合房源照片、位置、入住人数和评分。预订按钮用动作载荷传递房源标识。

<demo react="assistant-ui/riverside-loft-demo.tsx" />

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

<<< @/media-src/vis/demos/assistant-ui/riverside-loft-demo.tsx#spec
