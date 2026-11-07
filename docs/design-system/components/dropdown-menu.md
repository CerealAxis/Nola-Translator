---
title: Dropdown Menu（下拉菜单）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Dropdown Menu（下拉菜单）

由按钮触发，向用户展示一组操作或功能等菜单选项。

<demo react="shadcn-base/dropdown-menu-demo.tsx" />

*带图标、快捷键和子菜单项的下拉菜单。*

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add dropdown-menu
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/dropdown-menu.tsx [components/ui/dropdown-menu.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
```

```tsx:line-numbers
<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="outline" />}>
    Open
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuGroup>
      <DropdownMenuLabel>My Account</DropdownMenuLabel>
      <DropdownMenuItem>Profile</DropdownMenuItem>
      <DropdownMenuItem>Billing</DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuItem>Team</DropdownMenuItem>
      <DropdownMenuItem>Subscription</DropdownMenuItem>
    </DropdownMenuGroup>
  </DropdownMenuContent>
</DropdownMenu>
```

## 组件结构 {#composition}

使用以下结构构建 `DropdownMenu`：

```text
DropdownMenu
├── DropdownMenuTrigger
└── DropdownMenuContent
    ├── DropdownMenuGroup
    │   ├── DropdownMenuLabel
    │   ├── DropdownMenuItem
    │   └── DropdownMenuItem
    ├── DropdownMenuSeparator
    ├── DropdownMenuGroup
    │   ├── DropdownMenuLabel
    │   ├── DropdownMenuCheckboxItem
    │   └── DropdownMenuCheckboxItem
    ├── DropdownMenuSeparator
    ├── DropdownMenuGroup
    │   ├── DropdownMenuLabel
    │   └── DropdownMenuRadioGroup
    │       ├── DropdownMenuRadioItem
    │       └── DropdownMenuRadioItem
    └── DropdownMenuSub
        ├── DropdownMenuSubTrigger
        └── DropdownMenuSubContent
            └── DropdownMenuGroup
                ├── DropdownMenuLabel
                ├── DropdownMenuItem
                └── DropdownMenuItem
```

## 基础 {#basic}

带标签和分隔线的基础下拉菜单。

<demo react="shadcn-base/dropdown-menu-basic.tsx" />

## 子菜单 {#submenu}

使用 `DropdownMenuSub` 嵌套次级操作。

<demo react="shadcn-base/dropdown-menu-submenu.tsx" />

## 快捷键 {#shortcuts}

添加 `DropdownMenuShortcut` 显示键盘快捷提示。

<demo react="shadcn-base/dropdown-menu-shortcuts.tsx" />

## 图标 {#icons}

将图标与标签搭配使用，便于快速浏览。

<demo react="shadcn-base/dropdown-menu-icons.tsx" />

## 复选框 {#checkboxes}

使用 `DropdownMenuCheckboxItem` 提供可切换的选项。

<demo react="shadcn-base/dropdown-menu-checkboxes.tsx" />

## 带图标的复选框 {#checkboxes-icons}

为复选项添加图标。

<demo react="shadcn-base/dropdown-menu-checkboxes-icons.tsx" />

## 单选组 {#radio-group}

使用 `DropdownMenuRadioGroup` 提供互斥选项。

<demo react="shadcn-base/dropdown-menu-radio-group.tsx" />

## 带图标的单选项 {#radio-icons}

给单选项配上图标。

<demo react="shadcn-base/dropdown-menu-radio-icons.tsx" />

## 危险操作 {#destructive}

对不可逆的操作使用 `variant="destructive"`。

<demo react="shadcn-base/dropdown-menu-destructive.tsx" />

## 头像 {#avatar}

通过头像触发的账号切换下拉菜单。

<demo react="shadcn-base/dropdown-menu-avatar.tsx" />

## 综合示例 {#complex}

结合分组、图标和子菜单的示例。

<demo react="shadcn-base/dropdown-menu-complex.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/dropdown-menu-rtl.tsx" />

## API 参考 {#api-reference}

完整的 API 参考请参阅 [Base UI 文档](https://base-ui.com/react/components/menu)。
