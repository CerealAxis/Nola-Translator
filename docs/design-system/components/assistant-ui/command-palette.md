---
title: Command palette（命令面板）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Command palette（命令面板）

在同一个入口搜索并执行应用命令。

<demo react="assistant-ui/command-palette-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-command-palette"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-command-palette.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 将命令连接到真实动作

将命令 ID 映射到真实动作，例如新建会话或打开设置。

```tsx
"use client";

import { useAui } from "@assistant-ui/react";
import { useState } from "react";
import {
  CommandPalette,
  type PaletteCommand,
} from "@/components/assistant-ui/elements/command-palette";

const commands: PaletteCommand[] = [
  { id: "new-thread", label: "新建会话", group: "会话列表", keys: ["⌘", "N"] },
  { id: "stop", label: "停止生成", group: "会话", keys: ["Esc"] },
  { id: "archive", label: "归档此会话", group: "会话", keys: ["⌘", "⇧", "A"] },
];

export function AppCommandPalette() {
  const aui = useAui();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(commands[0]!.id);

  const run = (id: string) => {
    if (id === "new-thread") aui.threads.switchToNewThread();
    if (id === "stop") aui.thread.cancelRun();
    if (id === "archive") aui.threadListItem.archive();
  };

  return (
    <CommandPalette
      commands={commands}
      query={query}
      activeId={activeId}
      onQueryChange={setQuery}
      onActiveChange={setActiveId}
      onRun={run}
    />
  );
}
```

**独立使用**

### 保存列表、查询与活动项

在调用方管理命令列表、查询和当前活动项，根据键盘操作更新选择。

```tsx
"use client";

import { useState } from "react";
import { CommandPalette } from "@/components/assistant-ui/elements/command-palette";

const commands = [
  { id: "new-doc", label: "新建文档", group: "文件", keys: ["⌘", "N"] },
  { id: "share", label: "分享", group: "文件", keys: ["⌘", "⇧", "S"] },
];

export function AppCommandPalette({
  handlers,
}: {
  handlers: Record<string, () => void>;
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(commands[0].id);

  return (
    <CommandPalette
      commands={commands}
      query={query}
      activeId={activeId}
      onQueryChange={setQuery}
      onActiveChange={setActiveId}
      onRun={(id) => handlers[id]?.()}
    />
  );
}
```

## 结构 {#anatomy}

搜索框在顶部，下方按分组显示命令和快捷键。按下 Esc 可关闭入口。

```tsx
<div data-slot="command-palette">
  <div>
    <svg /* 图标 */ />
    <input placeholder="输入命令" role="combobox" />
    <span>esc</span>
  </div>
  <div role="listbox" aria-label="命令">
    {/* 显示条目列表 */}
  </div>
  {/* 对应槽位内容 */}
</div>
```

查询对命令标签做不区分大小写的子串匹配，分组按首个命中出现的顺序排列。方向键按分组后的顺序循环移动，回车执行当前命令。

## 示例 {#examples}

### 分组和筛选顺序

先筛选符合查询的命令，再按原分组顺序显示结果。

```tsx
{ id: "archive", label: "归档此会话", group: "会话", keys: ["⌘", "⇧", "A"] }
```

### 调整条目和 Esc 提示样式

通过组件提供的 `className` 调整布局。

```tsx
<CommandPalette className="max-w-lg" commands={commands} query={query} activeId={activeId} onQueryChange={setQuery} onActiveChange={setActiveId} onRun={onRun} />
```

## API 参考 {#api-reference}

**使用运行时**

### 操作示例

| 调用 | 类型 | 说明 |
| --------------------------------- | ------------ | ----------------------------------------------------------------- |
| `aui.threads.switchToNewThread()` | `() => void` | 新建并切换会话。 |
| `aui.thread.cancelRun()` | `() => void` | 取消当前运行。 |
| `aui.threadListItem.archive()` | `() => void` | 归档当前会话。 |

上面的运行时调用只是接入示例。`CommandPalette` 将选中的命令 ID 交给 `onRun`，命令目录及其执行由调用方管理。

**独立使用**

### CommandPalette

| 属性 | 类型 | 默认值 | 说明 |
| ---------------- | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `commands` | `readonly PaletteCommand[]` | 必填 | 可执行命令列表。 |
| `query` | `string` | 必填 | 当前搜索内容。 |
| `activeId` | `string` | 必填 | 当前高亮条目的 ID。 |
| `onQueryChange` | `(query: string) => void` |  | 搜索内容改变时调用。 |
| `onActiveChange` | `(id: string) => void` |  | 高亮条目变化时调用。 |
| `onRun` | `(id: string) => void` |  | 执行选中的命令时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### PaletteCommand

| 属性 | 类型 | 默认值 | 说明 |
| ------- | ------------------- | -------- | --------------------------------------------------------------------- |
| `id` | `string` | 必填 | 条目的稳定标识。 |
| `label` | `string` | 必填 | 要显示的标签。 |
| `group` | `string` | 必填 | 条目所在的分组。 |
| `keys` | `readonly string[]` | 必填 | 用于提示的键位。 |

其余 `div` 属性会转发给根元素。
