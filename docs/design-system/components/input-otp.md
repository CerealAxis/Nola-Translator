---
title: Input OTP（一次性密码输入）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Input OTP（一次性密码输入）

支持复制和粘贴的无障碍一次性密码组件。

<demo react="shadcn-base/input-otp-demo.tsx" />

## 关于 {#about}

Input OTP 基于 [@guilherme_rodz](https://twitter.com/guilherme_rodz) 的 [input-otp](https://github.com/guilhermerodz/input-otp) 构建。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add input-otp
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install input-otp
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/input-otp.tsx [components/ui/input-otp.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
```

```tsx:line-numbers
<InputOTP maxLength={6}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
  </InputOTPGroup>
  <InputOTPSeparator />
  <InputOTPGroup>
    <InputOTPSlot index={3} />
    <InputOTPSlot index={4} />
    <InputOTPSlot index={5} />
  </InputOTPGroup>
</InputOTP>
```

## 组件结构 {#composition}

使用以下结构构建 `InputOTP`：

```text
InputOTP
├── InputOTPGroup
│   ├── InputOTPSlot
│   ├── InputOTPSlot
│   └── InputOTPSlot
├── InputOTPSeparator
├── InputOTPGroup
│   ├── InputOTPSlot
│   ├── InputOTPSlot
│   └── InputOTPSlot
├── InputOTPSeparator
└── InputOTPGroup
    ├── InputOTPSlot
    └── InputOTPSlot
```

## 匹配模式 {#pattern}

使用 `pattern` 属性为一次性密码输入框定义自定义匹配模式。

```tsx:line-numbers{1,5}
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp"

;<InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS_AND_CHARS}>
  ...
</InputOTP>
```

<demo react="shadcn-base/input-otp-pattern.tsx" />

## 分隔符 {#separator}

使用 `<InputOTPSeparator />` 组件在输入组之间添加分隔符。

<demo react="shadcn-base/input-otp-separator.tsx" />

## 禁用 {#disabled}

使用 `disabled` 属性禁用输入框。

<demo react="shadcn-base/input-otp-disabled.tsx" />

## 受控 {#controlled}

使用 `value` 和 `onChange` 属性控制输入值。

<demo react="shadcn-base/input-otp-controlled.tsx" />

## 无效状态 {#invalid}

在插槽上使用 `aria-invalid` 显示错误状态。

<demo react="shadcn-base/input-otp-invalid.tsx" />

## 四位数字 {#four-digits}

PIN 码的常见格式。此示例使用 `pattern={REGEXP_ONLY_DIGITS}` 属性。

<demo react="shadcn-base/input-otp-four-digits.tsx" />

## 字母与数字 {#alphanumeric}

使用 `REGEXP_ONLY_DIGITS_AND_CHARS` 接受字母和数字。

<demo react="shadcn-base/input-otp-alphanumeric.tsx" />

## 表单 {#form}

<demo react="shadcn-base/input-otp-form.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/input-otp-rtl.tsx" />

## API 参考 {#api-reference}

详情请参阅 [input-otp](https://input-otp.rodz.dev) 文档。
