---
title: Switch（即时开关）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Switch（即时开关）

允许用户在选中和未选中之间切换的控件。

<demo react="shadcn-base/switch-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add switch
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/switch.tsx [components/ui/switch.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Switch } from "@/components/ui/switch"
```

```tsx
<Switch />
```

## 描述 {#description}

<demo react="shadcn-base/switch-description.tsx" />

## 选项卡片 {#choice-card}

使用 `FieldLabel` 包裹整个 `Field`，即可创建可点击的卡片式选项。

<demo react="shadcn-base/switch-choice-card.tsx" />

## 禁用 {#disabled}

为 `Switch` 组件添加 `disabled` 属性以禁用开关。为 `Field` 组件添加 `data-disabled` 属性以应用相应样式。

<demo react="shadcn-base/switch-disabled.tsx" />

## 无效 {#invalid}

为 `Switch` 组件添加 `aria-invalid` 属性以表示无效状态。为 `Field` 组件添加 `data-invalid` 属性以应用相应样式。

<demo react="shadcn-base/switch-invalid.tsx" />

## 尺寸 {#size}

使用 `size` 属性调整开关尺寸。

<demo react="shadcn-base/switch-sizes.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/switch-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Switch](https://base-ui.com/react/components/switch#api-reference) 文档。
