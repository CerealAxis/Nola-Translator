---
title: Command（命令面板）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Command（命令面板）

用于搜索和快捷操作的命令菜单。

<demo react="shadcn-base/command-demo.tsx" />

## 简介 {#about}

`<Command />` 组件使用 [Dip](https://www.dip.org/) 开发的 [`cmdk`](https://github.com/dip/cmdk) 组件。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add command
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install cmdk
```

**2. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/command.tsx [components/ui/command.tsx]

**3. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
```

```tsx:line-numbers
<Command className="max-w-sm rounded-lg border">
  <CommandInput placeholder="Type a command or search..." />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Suggestions">
      <CommandItem>Calendar</CommandItem>
      <CommandItem>Search Emoji</CommandItem>
      <CommandItem>Calculator</CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Settings">
      <CommandItem>Profile</CommandItem>
      <CommandItem>Billing</CommandItem>
      <CommandItem>Settings</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

## 结构 {#composition}

按以下结构组合 `Command`：

```text
Command
├── CommandInput
└── CommandList
    ├── CommandEmpty
    ├── CommandGroup
    │   ├── CommandItem
    │   └── CommandItem
    ├── CommandSeparator
    └── CommandGroup
        ├── CommandItem
        └── CommandItem
```

## 基础 {#basic}

对话框中的简单命令菜单。

<demo react="shadcn-base/command-basic.tsx" />

## 快捷键 {#shortcuts}

<demo react="shadcn-base/command-shortcuts.tsx" />

## 分组 {#groups}

带分组、图标和分隔符的命令菜单。

<demo react="shadcn-base/command-groups.tsx" />

## 可滚动 {#scrollable}

包含多个条目的可滚动命令菜单。

<demo react="shadcn-base/command-scrollable.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/command-rtl.tsx" />

## API 参考 {#api-reference}

更多信息请参阅 [cmdk](https://github.com/dip/cmdk) 文档。
