---
title: Mentions（提及）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Mentions（提及）

在编辑器用 @ 查找并插入人员或其他引用。

<demo react="assistant-ui/mentions-demo.tsx" />

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

### 定义人员

准备人员的 ID、名称、次要文字和可选头像。

```tsx
"use client";

import { unstable_useMentionAdapter } from "@assistant-ui/react";

export function useComposerMentions() {
  return unstable_useMentionAdapter({
    items: [
      { id: "ada", type: "person", label: "林安" },
      { id: "grace", type: "person", label: "顾宁" },
    ],
  });
}
```

提及中的引号规则可参阅 [指令格式](https://www.assistant-ui.com/docs/guides/mentions#directive-format)。

### 输入 @ 时打开菜单

运行时通过 unstable_useMentionAdapter 读取光标前的提及查询并打开列表。

```tsx
"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { floating, mono } from "@/components/assistant-ui/elements/surfaces";
import { useComposerMentions } from "./composer-mentions";

export function ComposerBar() {
  const mention = useComposerMentions();

  return (
    <ComposerPrimitive.TriggerPopoverRoot>
      <ComposerPrimitive.TriggerPopover char="@" adapter={mention.adapter}>
        <ComposerPrimitive.TriggerPopover.Directive
          formatter={mention.directive.formatter}
          onInserted={mention.directive.onInserted}
        />
        <ComposerPrimitive.TriggerPopoverItems>
          {(items) => (
            <div className={cn(floating, "absolute bottom-full z-10 mb-2 w-64 rounded-2xl p-1.5")}>
              {items.map((item, index) => (
                <ComposerPrimitive.TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  className="data-[highlighted]:bg-foreground/[0.04] flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 outline-none"
                >
                  <span className="bg-foreground/[0.06] text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium">
                    {item.label[0]}
                  </span>
                  <span className="flex-1 truncate text-start">{item.label}</span>
                  <span className={cn(mono, "text-muted-foreground")}>{item.type}</span>
                </ComposerPrimitive.TriggerPopoverItem>
              ))}
            </div>
          )}
        </ComposerPrimitive.TriggerPopoverItems>
      </ComposerPrimitive.TriggerPopover>
      <ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-[24px] p-2.5">
        <ComposerPrimitive.Input placeholder="输入消息，或键入 @ 提及…" rows={1} className="min-h-11 w-full resize-none bg-transparent px-3 outline-none" />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.TriggerPopoverRoot>
  );
}
```

**独立使用**

### 随草稿筛选

将查询交给 `useMentionMatches`，过滤人员结果。

```tsx
"use client";

import { useState } from "react";
import { useMentionMatches, applyMention, ComposerMenu, ComposerPersonItem, type ComposerPerson } from "@/components/assistant-ui/elements/composer";

const people: ComposerPerson[] = [
  { name: "林安", role: "human" },
  { name: "顾宁", role: "human" },
  { name: "审阅者", role: "agent" },
];

export function ChatBox() {
  const [text, setText] = useState("");
  const matches = useMentionMatches(text, people);

  return (
    <div className="relative">
      <ComposerMenu open={matches.length > 0}>
        {matches.map((person) => (
          <ComposerPersonItem
            key={person.name}
            person={person}
            active={false}
            onClick={() => setText((current) => applyMention(current, person.name))}
          />
        ))}
      </ComposerMenu>
      {/* 显示对应状态 */}
    </div>
  );
}
```

### 选中后继续输入

通过 `applyMention` 插入选择，并将光标放回编辑器，继续输入剩余内容。

## 结构 {#anatomy}

`ComposerPerson` 渲染候选列表，`ComposerPersonItem` 显示名称和信息。调用方处理匹配和文本插入。

```tsx
<div data-slot="composer-menu" data-open={/* 在对应状态下为 true */}>
  <button data-slot="composer-menu-item" data-active={/* 区分当前选中项 */}>
    {/* 显示名称或标题 */}
  </button>
</div>
```

运行时会插入指令文本，普通名称用 `:type[label]{name=id}`，ID 与标签相同时省略 `{name=…}`。消息渲染器解析后显示为标签。独立版的 `applyMention` 插入普通名称。

## 示例 {#examples}

### 边输入边筛选

在 @ 后输入名称的一部分，更新候选结果。

**使用运行时**

```tsx
mention.adapter.search("ada"); // → [{ id: "ada", label: "林安", ... }]
```

**独立使用**

```tsx
const matches = useMentionMatches("cc @ada", people); // → [{ name: "林安", ... }]
```

### 提及工具

候选也可以代表工具。使用相同的数据结构和插入动作。

**使用运行时**

```tsx
const mention = unstable_useMentionAdapter({
  includeModelContextTools: true,
});
```

### 调整菜单样式

通过 `className` 调整列表和条目。

```tsx
<ComposerMenu className="w-80" open={open}>
  {/* 显示条目列表 */}
</ComposerMenu>
```

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive 触发器

| 组成部分 | Renders | 说明 |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `TriggerPopoverRoot` | provider | 建立编辑器触发弹层的上下文。 |
| `TriggerPopover` | `div` (when open) | 在识别到触发查询时显示弹层。 |
| `TriggerPopover.Directive` | behavior | 插入选中的提及指令。 |
| `TriggerPopoverItems` / `Item` | render prop / `button` | 遍历并渲染匹配的候选项。 |

### unstable_useMentionAdapter

| 选项 | 类型 | 说明 |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items` | `Unstable_Mention[]` | 按顺序渲染的条目。 |
| `categories` | `Unstable_MentionCategory[]` | 候选项的分类。 |
| `includeModelContextTools` | `boolean \| { category?, formatLabel?, icon? }` | 是否把模型上下文中的工具作为提及候选。 |
| `formatter` | `DirectiveFormatter` | 生成插入文本的格式化函数。 |
| `onInserted` | `(item) => void` | 提及文本插入后调用。 |

`unstable_useMentionAdapter` 返回 `{ adapter, directive, iconMap?, fallbackIcon? }`。将 `directive` 展开传给 `TriggerPopover.Directive`。`useMentionMatches` 匹配以光标所在 `@query` 开头的名称。`applyMention(value: string, name: string)` 将尾部查询替换为 `@{name}` 并补上一个空格。

**独立使用**

### useMentionMatches

| 参数 | 类型 | 说明 |
| --------- | ---------------------------------------- | ----------------------- |
| `value` | `string` | 当前值。 |
| `people` | `readonly ComposerPerson[] \| undefined` | 用于匹配的人员列表。 |

### applyMention

### ComposerPerson

| 字段 | 类型 | 说明 |
| ------ | -------------------- | --------------------------------------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `role` | `"agent" \| "human"` | 名称旁的角色或次要说明。 |

### ComposerPersonItem

| 属性 | 类型 | 默认值 | 说明 |
| -------- | ---------------- | -------- | --------------------- |
| `person` | `ComposerPerson` | 必填 | 要显示的人员。 |
| `active` | `boolean` | 必填 | 是否为当前活动项。 |
