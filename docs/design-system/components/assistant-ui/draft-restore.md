---
title: Draft restore（恢复草稿）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Draft restore（恢复草稿）

提示用户恢复之前保存的未发送草稿，或将它丢弃。

<demo react="assistant-ui/draft-restore-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-draft-restore"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-draft-restore.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 边输入边保存草稿

监听编辑器草稿并按会话保存文本与时间。

```tsx
"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useRef } from "react";

function saveDraft(threadId: string, text: string) {
  if (text) localStorage.setItem(`draft:${threadId}`, text);
  else localStorage.removeItem(`draft:${threadId}`);
}

export function useDraftPersistence(threadId: string) {
  const text = useAuiState((s) => s.composer.text);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDraft(threadId, text), 400);
    return () => clearTimeout(timer.current);
  }, [threadId, text]);
}
```

### 恢复或丢弃草稿

恢复时把内容写回编辑器，丢弃时清理保存记录。

```tsx
"use client";

import { useAui } from "@assistant-ui/react";
import { DraftRestore } from "@/components/assistant-ui/elements/draft-restore";

export function DraftRestoreBanner({
  threadId,
  draft,
  savedAt,
  onDismiss,
}: {
  threadId: string;
  draft: string;
  savedAt: string;
  onDismiss: () => void;
}) {
  const aui = useAui();
  return (
    <DraftRestore
      draft={draft}
      savedAt={savedAt}
      onRestore={() => {
        aui.composer.setText(draft);
        localStorage.removeItem(`draft:${threadId}`);
        onDismiss();
      }}
      onDiscard={() => {
        localStorage.removeItem(`draft:${threadId}`);
        onDismiss();
      }}
    />
  );
}
```

**独立使用**

### 保存草稿并连接操作

独立版提供草稿、可读时间和恢复、丢弃回调。

```tsx
"use client";

import { useState } from "react";
import { DraftRestore } from "@/components/assistant-ui/elements/draft-restore";

export function ThreadDraftBanner({
  onRestore,
}: {
  onRestore: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(
    "为草稿恢复添加一项回归测试",
  );

  if (!draft) return null;

  return (
    <DraftRestore
      draft={draft}
      savedAt="两分钟前"
      onRestore={() => {
        onRestore(draft);
        setDraft(null);
      }}
      onDiscard={() => setDraft(null)}
    />
  );
}
```

## 结构 {#anatomy}

提示条显示保存时间，并提供恢复与丢弃两个操作。

```tsx
<div data-slot="draft-restore">
  <svg /* 图标 */ />
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <button>恢复</button>
  <button aria-label="丢弃草稿">{/* 图标 */}</button>
</div>
```

组件挂载后始终显示，通常在恢复或丢弃时清除已保存草稿。文本过长时截断，`savedAt` 原样显示。

## 示例 {#examples}

### 调整提示条样式

通过 `className` 调整根元素。

```tsx
<DraftRestore className="max-w-md" draft={draft} savedAt={savedAt} onRestore={restore} onDiscard={discard} />
```

### 格式化时间

在调用方将保存时间格式化为合适的本地文本后传入。

```tsx
const savedAt = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-2, "minute");
```

## API 参考 {#api-reference}

**使用运行时**

### 编辑器状态

| 选择器 | 类型 | 说明 |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `s.composer.text` | `string` | 当前编辑器草稿。 |
| `aui.composer.setText(text)` | `(text: string) => void` | 将指定文本写入编辑器。 |

草稿的持久化，以及是否显示恢复提示，均由调用方控制。

**独立使用**

### DraftRestore

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------ | -------- | --------------------------------------------- |
| `draft` | `string` | 必填 | 待恢复的草稿内容。 |
| `savedAt` | `string` | 必填 | 保存草稿的可读时间。 |
| `onRestore` | `() => void` |  | 选择恢复时调用。 |
| `onDiscard` | `() => void` |  | 选择丢弃时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
