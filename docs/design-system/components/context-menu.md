---
title: Context Menu（右键菜单）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Context Menu（右键菜单）

显示通过右键点击触发的操作菜单。

<demo react="shadcn-base/context-menu-demo.tsx" />

*A context menu with sub menu items.*

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add context-menu
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/context-menu.tsx [components/ui/context-menu.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
```

```tsx:line-numbers
<ContextMenu>
  <ContextMenuTrigger>Right click here</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Profile</ContextMenuItem>
    <ContextMenuItem>Billing</ContextMenuItem>
    <ContextMenuItem>Team</ContextMenuItem>
    <ContextMenuItem>Subscription</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

## 结构 {#composition}

按以下结构组合 `ContextMenu`：

```text
ContextMenu
├── ContextMenuTrigger
└── ContextMenuContent
    ├── ContextMenuGroup
    │   ├── ContextMenuLabel
    │   ├── ContextMenuItem
    │   └── ContextMenuItem
    ├── ContextMenuSeparator
    ├── ContextMenuGroup
    │   ├── ContextMenuLabel
    │   ├── ContextMenuCheckboxItem
    │   └── ContextMenuCheckboxItem
    ├── ContextMenuSeparator
    ├── ContextMenuGroup
    │   ├── ContextMenuLabel
    │   └── ContextMenuRadioGroup
    │       ├── ContextMenuRadioItem
    │       └── ContextMenuRadioItem
    └── ContextMenuSub
        ├── ContextMenuSubTrigger
        └── ContextMenuSubContent
            └── ContextMenuGroup
                ├── ContextMenuItem
                └── ContextMenuItem
```

## 基础 {#basic}

包含几个操作的简单上下文菜单。

<demo react="shadcn-base/context-menu-basic.tsx" />

## 子菜单 {#submenu}

使用 `ContextMenuSub` 嵌套次级操作。

<demo react="shadcn-base/context-menu-submenu.tsx" />

## 快捷键 {#shortcuts}

添加 `ContextMenuShortcut` 以显示键盘快捷键。

<demo react="shadcn-base/context-menu-shortcuts.tsx" />

## 分组 {#groups}

将相关操作分组，并用分隔符隔开各组。

<demo react="shadcn-base/context-menu-groups.tsx" />

## 图标 {#icons}

将图标和标签搭配使用，方便快速浏览。

<demo react="shadcn-base/context-menu-icons.tsx" />

## 复选框 {#checkboxes}

使用 `ContextMenuCheckboxItem` 切换状态。

<demo react="shadcn-base/context-menu-checkboxes.tsx" />

## 单选项 {#radio}

使用 `ContextMenuRadioItem` 提供互斥选项。

<demo react="shadcn-base/context-menu-radio.tsx" />

## 危险操作 {#destructive}

使用 `variant="destructive"` 为菜单条目应用危险操作样式。

<demo react="shadcn-base/context-menu-destructive.tsx" />

## 方位 {#sides}

使用 side 和 align 属性控制子菜单的位置。

<demo react="shadcn-base/context-menu-sides.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/context-menu-rtl.tsx" />

使用 `side="inline-end"` 将菜单放在触发器逻辑上的右侧。

```tsx:line-numbers
<ContextMenu>
  <ContextMenuTrigger>Right click here</ContextMenuTrigger>
  <ContextMenuContent side="inline-end">
    <ContextMenuItem>Profile</ContextMenuItem>
    <ContextMenuItem>Billing</ContextMenuItem>
    <ContextMenuItem>Team</ContextMenuItem>
    <ContextMenuItem>Subscription</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

## API 参考 {#api-reference}

更多信息请参阅 [Base UI](https://base-ui.com/react/components/context-menu#api-reference) 文档。
