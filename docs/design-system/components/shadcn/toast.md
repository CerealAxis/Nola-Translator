---
title: Toast（轻提示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Toast（轻提示）

短暂显示的简短消息。

<demo react="shadcn-base/toast-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**1. 运行以下命令：**

```bash
npx shadcn@latest add toast
```

**2. 添加 Toaster 组件。**

```tsx:line-numbers{1,9} [app/layout.tsx]
import { Toaster } from "@/components/ui/toast"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/toast.tsx [components/ui/toast.tsx]

**3. 更新导入路径，使其与项目配置一致。**

**4. 添加 Toaster 组件。**

```tsx:line-numbers{1,8} [app/layout.tsx]
import { Toaster } from "@/components/ui/toast"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { toast } from "@/components/ui/toast"
```

```tsx
toast.add({
  title: "Event created",
  description: "Sunday, December 3 at 9:00 AM",
})
```

## 类型 {#types}

设置 `type` 选项来渲染状态图标。内置渲染器识别
`success`、`info`、`warning`、`error` 和 `loading`。

<demo react="shadcn-base/toast-types.tsx" />

## 操作 {#action}

通过 `actionProps` 传入按钮属性，即可渲染操作按钮。

```tsx
const id = toast.add({
  title: "Event created",
  actionProps: {
    children: "Undo",
    onClick() {
      toast.close(id)
    },
  },
})
```

## Promise 异步任务 {#promise}

使用 `toast.promise`，在异步任务经历加载、成功和错误状态时
更新同一条通知。

<demo react="shadcn-base/toast-promise.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Toast 文档](https://base-ui.com/react/components/toast)，
了解管理器选项、堆叠、滑动关闭以及
基础组件 API。
