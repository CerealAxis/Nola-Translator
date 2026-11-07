---
title: Slash commands（斜杠命令）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Slash commands（斜杠命令）

在编辑器输入斜杠时，查找并执行命令。

<demo react="assistant-ui/slash-commands-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-composer"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-composer.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 定义命令

先定义命令的 ID、名称、说明与动作。

```tsx
"use client";

import { unstable_useSlashCommandAdapter } from "@assistant-ui/react";

export function useComposerCommands() {
  return unstable_useSlashCommandAdapter({
    commands: [
      { id: "summarize", description: "总结这段会话", icon: "FileText", execute: () => runSummarize() },
      { id: "translate", description: "翻译上一条回复", icon: "语言", execute: () => runTranslate() },
    ],
  });
}
```

### 输入 / 时打开菜单

运行时可使用 unstable_useSlashCommandAdapter，读取光标附近的斜杠触发状态。

```tsx
"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { floating } from "@/components/assistant-ui/elements/surfaces";
import { useComposerCommands } from "./composer-commands";

export function ComposerBar() {
  const slash = useComposerCommands();

  return (
    <ComposerPrimitive.TriggerPopoverRoot>
      <ComposerPrimitive.TriggerPopover char="/" adapter={slash.adapter}>
        <ComposerPrimitive.TriggerPopover.Action
          onExecute={slash.action.onExecute}
          removeOnExecute={slash.action.removeOnExecute}
        />
        <ComposerPrimitive.TriggerPopoverItems>
          {(items) => (
            <div className={cn(floating, "absolute bottom-full z-10 mb-2 w-72 rounded-2xl p-1.5")}>
              {items.map((item, index) => (
                <ComposerPrimitive.TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  className="data-[highlighted]:bg-foreground/[0.04] flex w-full flex-col items-start gap-0.5 rounded-[10px] px-2.5 py-2 text-start outline-none"
                >
                  <span className="text-[13.5px] font-medium">/{item.id}</span>
                  {item.description && <span className="text-muted-foreground text-xs">{item.description}</span>}
                </ComposerPrimitive.TriggerPopoverItem>
              ))}
            </div>
          )}
        </ComposerPrimitive.TriggerPopoverItems>
      </ComposerPrimitive.TriggerPopover>
      <ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-[24px] p-2.5">
        <ComposerPrimitive.Input placeholder="输入消息，或键入 / 查看命令…" rows={1} className="min-h-11 w-full resize-none bg-transparent px-3 outline-none" />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.TriggerPopoverRoot>
  );
}
```

**独立使用**

### 随草稿筛选

将草稿查询交给 `useSlashMatches`，更新匹配列表。

```tsx
"use client";

import { useState } from "react";
import { useSlashMatches, ComposerMenu, ComposerCommandItem, type ComposerCommand } from "@/components/assistant-ui/elements/composer";
import { FileTextIcon, LanguagesIcon } from "lucide-react";

const commands: ComposerCommand[] = [
  { name: "summarize", description: "总结这段会话", icon: FileTextIcon },
  { name: "translate", description: "翻译上一条回复", icon: LanguagesIcon },
];

export function ChatBox() {
  const [text, setText] = useState("");
  const matches = useSlashMatches(text, commands);

  return (
    <div className="relative">
      <ComposerMenu open={matches.length > 0}>
        {matches.map((command) => (
          <ComposerCommandItem key={command.name} command={command} active={false} onClick={() => runCommand(command.name)} />
        ))}
      </ComposerMenu>
      {/* 对应槽位内容 */}
    </div>
  );
}
```

### 跟踪高亮项

保存高亮条目。键盘移动时更新，确认时执行选中的命令。

## 结构 {#anatomy}

`ComposerCommand` 显示命令菜单，`ComposerCommandItem` 展示每条结果，编辑器负责查询和选中状态。

```tsx
<div data-slot="composer-menu" data-open={/* 在对应状态下为 true */}>
  <button data-slot="composer-menu-item" data-active={/* 区分当前选中项 */}>
    {/* 区分当前选中项 */}
  </button>
</div>
```

独立版在草稿以斜杠开头时匹配命令名称前缀。运行时在草稿开头或空白之后识别斜杠，并可匹配命令的 ID、标签和说明。`active` 只改变条目的外观。

## 示例 {#examples}

### 边输入边筛选

输入斜杠后继续键入名称，查询变化时重新过滤。

**使用运行时**

```tsx
slash.adapter.search("sum"); // → [{ id: "summarize", ... }]
```

**独立使用**

```tsx
const matches = useSlashMatches("/sum", commands); // → [commands[0]]
```

### 调整菜单样式

通过 `className` 调整菜单外层和条目。

```tsx
<ComposerMenu className="w-96" open={open}>
  {/* 显示条目列表 */}
</ComposerMenu>
```

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive 触发器

| 组成部分 | Renders | 说明 |
| -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TriggerPopoverRoot` | provider | 建立编辑器触发弹层的上下文。 |
| `TriggerPopover` | `div` (when open) | 在识别到触发查询时显示弹层。 |
| `TriggerPopover.Action` | behavior | 将某条斜杠命令绑定到执行动作。 |
| `TriggerPopoverItems` | render prop | 渲染当前查询的候选项列表。 |
| `TriggerPopoverItem` | `button` | 渲染单个候选项。 |
| `TriggerPopoverCategories` / `TriggerPopoverCategoryItem` / `TriggerPopoverBack` | render prop / `button` / `button` | 按分类显示结果，并支持进入和返回分类。 |

### unstable_useSlashCommandAdapter

| 选项 | 类型 | 说明 |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `commands` | `Unstable_SlashCommand[]` | 可执行命令列表。 |
| `removeOnExecute` | `boolean` | 执行命令后是否删除触发命令的文本。 |

`unstable_useSlashCommandAdapter` 返回 `{ adapter, action, iconMap?, fallbackIcon? }`。将 `action` 展开传给 `TriggerPopover.Action`。`useSlashMatches` 匹配名称以斜杠后的内容开头的命令。`value` 未以斜杠开头时返回空数组。

**独立使用**

### useSlashMatches

| 参数 | 类型 | 说明 |
| ---------- | ----------------------------------------- | ----------------------- |
| `value` | `string` | 当前值。 |
| `commands` | `readonly ComposerCommand[] \| undefined` | 可执行命令列表。 |

### ComposerCommand

| 字段 | 类型 | 说明 |
| ------------- | ------------ | -------------------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `description` | `string` | 补充说明。 |
| `icon` | `LucideIcon` | 自定义显示图标。 |

### ComposerCommandItem

| 属性 | 类型 | 默认值 | 说明 |
| --------- | ----------------- | -------- | ------------------------------------- |
| `command` | `ComposerCommand` | 必填 | 要执行或显示的命令。 |
| `active` | `boolean` | 必填 | 是否为当前活动项。 |
