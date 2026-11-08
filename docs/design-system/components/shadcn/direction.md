---
title: Direction（阅读方向）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Direction（阅读方向）

为应用设置文本方向的 Provider 组件。

`DirectionProvider` 组件用于设置应用的文本方向（`ltr` 或 `rtl`）。这对支持阿拉伯语、希伯来语和波斯语等从右到左书写的语言至关重要。

下面是组件在 RTL 模式下的预览。使用语言选择器切换语言。更多示例请参阅各组件页面的 RTL 章节。

<demo react="shadcn-base/card-rtl.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add direction
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/direction.tsx [components/ui/direction.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { DirectionProvider } from "@/components/ui/direction"
```

```tsx:line-numbers
<html dir="rtl">
  <body>
    <DirectionProvider direction="rtl">
      {/* Your app content */}
    </DirectionProvider>
  </body>
</html>
```

## useDirection {#usedirection}

使用 `useDirection` Hook 获取应用当前的文本方向。

```tsx:line-numbers
import { useDirection } from "@/components/ui/direction"

function MyComponent() {
  const direction = useDirection()
  return <div>Current direction: {direction}</div>
}
```
