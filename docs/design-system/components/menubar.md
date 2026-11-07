---
title: Menubar（菜单栏）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Menubar（菜单栏）

桌面应用中常见的常驻菜单，可快速访问一组固定命令。

<demo react="shadcn-base/menubar-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add menubar
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/menubar.tsx [components/ui/menubar.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"
```

```tsx:line-numbers
<Menubar>
  <MenubarMenu>
    <MenubarTrigger>File</MenubarTrigger>
    <MenubarContent>
      <MenubarGroup>
        <MenubarItem>
          New Tab <MenubarShortcut>⌘T</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>New Window</MenubarItem>
      </MenubarGroup>
      <MenubarSeparator />
      <MenubarGroup>
        <MenubarItem>Share</MenubarItem>
        <MenubarItem>Print</MenubarItem>
      </MenubarGroup>
    </MenubarContent>
  </MenubarMenu>
</Menubar>
```

## 组件结构 {#composition}

使用以下结构构建 `Menubar`：

```text
Menubar
├── MenubarMenu
│   ├── MenubarTrigger
│   └── MenubarContent
│       ├── MenubarGroup
│       │   ├── MenubarLabel
│       │   ├── MenubarItem
│       │   └── MenubarItem
│       ├── MenubarSeparator
│       ├── MenubarGroup
│       │   ├── MenubarLabel
│       │   ├── MenubarCheckboxItem
│       │   └── MenubarCheckboxItem
│       ├── MenubarSeparator
│       ├── MenubarGroup
│       │   ├── MenubarLabel
│       │   └── MenubarRadioGroup
│       │       ├── MenubarRadioItem
│       │       └── MenubarRadioItem
│       └── MenubarSub
│           ├── MenubarSubTrigger
│           └── MenubarSubContent
│               └── MenubarGroup
│                   ├── MenubarLabel
│                   ├── MenubarItem
│                   └── MenubarItem
└── MenubarMenu
    ├── MenubarTrigger
    └── MenubarContent
        └── MenubarGroup
            ├── MenubarLabel
            ├── MenubarItem
            └── MenubarItem
```

## 复选框 {#checkbox}

使用 `MenubarCheckboxItem` 提供可切换的选项。

<demo react="shadcn-base/menubar-checkbox.tsx" />

## 单选框 {#radio}

使用 `MenubarRadioGroup` 和 `MenubarRadioItem` 提供单选选项。

<demo react="shadcn-base/menubar-radio.tsx" />

## 子菜单 {#submenu}

使用 `MenubarSub`、`MenubarSubTrigger` 和 `MenubarSubContent` 创建嵌套菜单。

<demo react="shadcn-base/menubar-submenu.tsx" />

## 带图标 {#with-icons}

<demo react="shadcn-base/menubar-icons.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/menubar-rtl.tsx" />

## API 参考 {#api-reference}

详情请参阅 [Base UI Menubar](https://base-ui.com/react/components/menubar#api-reference) 文档。
