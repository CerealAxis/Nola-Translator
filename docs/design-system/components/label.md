---
title: Label（标签）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Label（标签）

渲染与控件关联的无障碍标签。

<demo react="shadcn-base/label-demo.tsx" />

<div class="shadcn-doc-callout">

  对于表单字段，请使用 [Field](https://ui.shadcn.com/docs/components/base/field) 组件，
  它内置标签、描述和错误处理。

</div>

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add label
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/label.tsx [components/ui/label.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Label } from "@/components/ui/label"
```

```tsx
<Label htmlFor="email">Your email address</Label>
```

## 表单字段中的标签 {#label-in-field}

对于表单字段，请使用 [Field](https://ui.shadcn.com/docs/components/base/field) 组件，
它内置 `FieldLabel`、`FieldDescription` 和 `FieldError` 组件。

```tsx
<Field>
  <FieldLabel htmlFor="email">Your email address</FieldLabel>
  <Input id="email" />
</Field>
```

<demo react="shadcn-base/field-demo.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/label-rtl.tsx" />

## API 参考 {#api-reference}

详情请参阅 [Base UI Label](https://base-ui.com/react/components/label#api-reference) 文档。
