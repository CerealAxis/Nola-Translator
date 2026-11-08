---
title: Kbd（键盘按键）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Kbd（键盘按键）

用于显示用户通过键盘输入的文本。

<demo react="shadcn-base/kbd-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add kbd
```

</template>

<template #manual>

**1. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/kbd.tsx [components/ui/kbd.tsx]

**2. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
import { Kbd } from "@/components/ui/kbd"
```

```tsx
<Kbd>Ctrl</Kbd>
```

## 组件结构 {#composition}

使用以下结构构建 `Kbd` 和 `KbdGroup`：

```text
Kbd
KbdGroup
├── Kbd
└── Kbd
```

## 按键组 {#group}

使用 `KbdGroup` 组件将键盘按键分组。

<demo react="shadcn-base/kbd-group.tsx" />

## 按钮 {#button}

在 `Button` 组件内使用 `Kbd` 组件，可在按钮中显示键盘按键。

<demo react="shadcn-base/kbd-button.tsx" />

## 工具提示 {#tooltip}

可以在 `Tooltip` 组件内使用 `Kbd` 组件，显示带键盘按键的工具提示。

<demo react="shadcn-base/kbd-tooltip.tsx" />

## 输入组 {#input-group}

可以在 `InputGroupAddon` 组件内使用 `Kbd` 组件，在输入组中显示键盘按键。

<demo react="shadcn-base/kbd-input-group.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/kbd-rtl.tsx" />

## API 参考 {#api-reference}

### Kbd {#kbd}

使用 `Kbd` 组件显示键盘按键。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | ``      |

```tsx
<Kbd>Ctrl</Kbd>
```

### KbdGroup {#kbdgroup}

使用 `KbdGroup` 组件将 `Kbd` 组件分组。

| 属性        | 类型     | 默认值 |
| ----------- | -------- | ------- |
| `className` | `string` | ``      |

```tsx
<KbdGroup>
  <Kbd>Ctrl</Kbd>
  <Kbd>B</Kbd>
</KbdGroup>
```
