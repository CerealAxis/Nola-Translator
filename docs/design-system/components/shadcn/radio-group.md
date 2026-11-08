---
title: Radio Group（单选组）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Radio Group（单选组）

一组可选中的按钮，称为单选按钮，同一时间最多只能选中一个。

<demo react="shadcn-base/radio-group-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add radio-group
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/radio-group.tsx [components/ui/radio-group.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
```

```tsx:line-numbers
<RadioGroup defaultValue="option-one">
  <div className="flex items-center gap-3">
    <RadioGroupItem value="option-one" id="option-one" />
    <Label htmlFor="option-one">Option One</Label>
  </div>
  <div className="flex items-center gap-3">
    <RadioGroupItem value="option-two" id="option-two" />
    <Label htmlFor="option-two">Option Two</Label>
  </div>
</RadioGroup>
```

## 组件结构 {#composition}

使用以下结构构建 `RadioGroup`：

```text
RadioGroup
├── RadioGroupItem
└── RadioGroupItem
```

## 描述 {#description}

使用 `Field` 组件为单选框组选项添加描述。

<demo react="shadcn-base/radio-group-description.tsx" />

## 选项卡片 {#choice-card}

用 `FieldLabel` 包裹整个 `Field`，即可创建可点击的卡片式选项。

<demo react="shadcn-base/radio-group-choice-card.tsx" />

## 字段集 {#fieldset}

使用 `FieldSet` 和 `FieldLegend` 将单选项分组，并提供标签和描述。

<demo react="shadcn-base/radio-group-fieldset.tsx" />

## 禁用 {#disabled}

给 `RadioGroup` 设置 `disabled` 属性可禁用所有选项。

<demo react="shadcn-base/radio-group-disabled.tsx" />

## 无效 {#invalid}

在 `RadioGroupItem` 上设置 `aria-invalid`，并在 `Field` 上设置 `data-invalid`，以显示验证错误。

<demo react="shadcn-base/radio-group-invalid.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/radio-group-rtl.tsx" />

## API 参考 {#api-reference}

请参阅 [Base UI Radio Group](https://base-ui.com/react/components/radio-group#api-reference) 文档。
