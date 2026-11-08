---
title: Composer trigger popover（编辑器触发浮层）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Composer trigger popover（编辑器触发浮层）

在输入区键入触发字符后，打开可按类别浏览、搜索并选择的弹层。

<demo react="assistant-ui/composer-trigger-popover-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/composer-trigger-popover"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

## 快速开始 {#getting-started}

用触发弹层根节点包裹输入区，再为每个触发字符声明一个弹层。

### 包裹输入区 {#wrap-the-composer}

将 `ComposerPrimitive.TriggerPopoverRoot` 放到 `ComposerPrimitive.Root` 外层，输入组件仍放在根节点内。

```tsx
import { ComposerPrimitive } from "@assistant-ui/react";

const Composer = () => (
  <ComposerPrimitive.TriggerPopoverRoot>
    <ComposerPrimitive.Root>
      <ComposerPrimitive.Input placeholder="输入 @ 提及…" />
      <ComposerPrimitive.Send />
      {/* triggers declared here */}
    </ComposerPrimitive.Root>
  </ComposerPrimitive.TriggerPopoverRoot>
);
```

### 声明提及触发器 {#declare-a-mention-trigger}

用 `unstable_useMentionAdapter` 构建提及数据，给 `ComposerTriggerPopover` 设置 `char="@"`。

```tsx
import { unstable_useMentionAdapter } from "@assistant-ui/react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/elements/composer-trigger-popover.aui";

function MentionTrigger() {
  const mention = unstable_useMentionAdapter();
  return <ComposerTriggerPopover char="@" {...mention} />;
}
```

## 结构 {#anatomy}

初始可以显示类别；选中类别或输入查询后显示候选项，也可返回类别列表。

```tsx
<div data-slot="composer-trigger-popover" role="listbox">
  {/* categories has entries, query is empty, and no category is active */}
  <div data-slot="composer-trigger-popover-categories" role="group">
    <button role="option" /> {/* one per category */}
  </div>

  {/* a category is active, or the query is non-empty, or the adapter has no categories */}
  <div data-slot="composer-trigger-popover-items" role="group">
    <button /> {/* Back, only while a category is active and not searching */}
    <button role="option" /> {/* one per item */}
  </div>
</div>
```

## 示例 {#examples}

斜杠命令、异步提及与自定义匹配可以组合在同一个输入区。

### 斜杠命令 {#slash-command}

通过 `unstable_useSlashCommandAdapter` 提供命令，设置 `char="/"`，选中后执行命令。

```tsx
import {
  unstable_useSlashCommandAdapter,
  type Unstable_SlashCommand,
} from "@assistant-ui/react";
import { FileTextIcon, GlobeIcon, SlashIcon } from "lucide-react";

const SLASH_COMMANDS: readonly Unstable_SlashCommand[] = [
  { id: "summarize", description: "总结对话", icon: "FileText", execute: () => {} },
  { id: "search", description: "搜索网页", icon: "Globe", execute: () => {} },
];

function SlashTrigger() {
  const slash = unstable_useSlashCommandAdapter({ commands: SLASH_COMMANDS });
  return (
    <ComposerTriggerPopover
      char="/"
      {...slash}
      iconMap={{ FileText: FileTextIcon, Globe: GlobeIcon }}
      fallbackIcon={SlashIcon}
    />
  );
}
```

### 异步候选项和加载状态 {#async-items-with-a-loading-state}

用 `unstable_useLiveCompletionAdapter` 请求候选项，并把 `isLoading` 传给弹层。

```tsx
const mentions = unstable_useLiveCompletionAdapter({
  fetcher: (query) => searchUsers(query),
});

<ComposerTriggerPopover
  char="@"
  adapter={mentions.adapter}
  isLoading={mentions.isLoading}
  directive={{ onInserted: (item) => track("mention", item.id) }}
/>;
```

### 自定义查询匹配 {#custom-query-matching}

实现适配器的 `search`，由应用决定查询匹配规则。

```tsx
import type { TriggerMatcher } from "@assistant-ui/react";

const matchMultiWord: TriggerMatcher = (text, triggerChar, cursorPosition) => {
  const upToCursor = text.slice(0, cursorPosition);
  const offset = upToCursor.lastIndexOf(triggerChar);
  if (offset === -1) return null;

  const preceding = upToCursor[offset - 1];
  if (preceding && !/\s/u.test(preceding)) return null;

  const query = upToCursor.slice(offset + triggerChar.length);
  if (/[\n\t]/u.test(query) || query.endsWith("  ")) return null;

  return { query, offset, endOffset: cursorPosition };
};

<ComposerTriggerPopover char="@" matcher={matchMultiWord} {...mention} />;
```

### 组合触发器 {#combining-triggers}

为 `@` 和 `/` 等字符分别注册弹层，各自使用对应数据和行为。

```tsx
<ComposerPrimitive.TriggerPopoverRoot>
  <ComposerPrimitive.Root>
    <ComposerPrimitive.Input placeholder="输入 @ 提及，输入 / 查看命令…" />
    <MentionTrigger />
    <SlashTrigger />
  </ComposerPrimitive.Root>
</ComposerPrimitive.TriggerPopoverRoot>
```

## API 参考 {#api-reference}

弹层负责展示和键盘操作，适配器负责提供类别与候选项。

### ComposerTriggerPopover {#composertriggerpopover}

`char` 定义触发字符；`adapter` 提供数据；`directive` 插入指令，`action` 执行应用操作。

### TriggerAdapter {#triggeradapter}

用 `categories` 返回分类，`categoryItems` 返回分类下的候选项，`search` 可选。

### 适配器 Hook {#adapter-hooks}

提及、斜杠命令和实时补全各有对应 Hook。

### 键盘导航 {#keyboard-navigation}

方向键在候选项间移动，Enter 确认，Escape 关闭。

### 无障碍 {#accessibility}

弹层和候选项使用列表框语义；让候选项标签准确描述插入内容或执行操作。
