---
title: Tabs（标签页）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Tabs（标签页）

一组分层的内容区，称为选项卡面板，每次显示其中一个。

<demo react="shadcn-base/tabs-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add tabs
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/tabs.tsx [components/ui/tabs.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
```

```tsx:line-numbers
<Tabs defaultValue="account" className="w-[400px]">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">Make changes to your account here.</TabsContent>
  <TabsContent value="password">Change your password here.</TabsContent>
</Tabs>
```

## 组件结构 {#composition}

使用以下结构构建 `Tabs`：

```text
Tabs
├── TabsList
│   ├── TabsTrigger
│   └── TabsTrigger
├── TabsContent
└── TabsContent
```

## 线条样式 {#line}

在 `TabsList` 上设置 `variant="line"` 以使用线条样式。

<demo react="shadcn-base/tabs-line.tsx" />

## 垂直 {#vertical}

使用 `orientation="vertical"` 创建垂直选项卡。

<demo react="shadcn-base/tabs-vertical.tsx" />

## 禁用 {#disabled}

<demo react="shadcn-base/tabs-disabled.tsx" />

## 图标 {#icons}

<demo react="shadcn-base/tabs-icons.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/tabs-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Tabs](https://base-ui.com/react/components/tabs#api-reference) 文档。
