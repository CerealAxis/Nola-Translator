---
title: Models（模型列表）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Models（模型列表）

在编辑器中查看当前模型，并选择接下来要使用的模型。

<demo react="assistant-ui/models-demo.tsx" />

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

### 读取当前模型

从当前模型上下文读取模型名称。

```tsx
import { useAuiState } from "@assistant-ui/react";

const modelName = useAuiState((s) => s.modelContext.modelName);
```

### 登记模型更改

选择后将模型配置写回应用或运行时，使后续请求采用它。

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { ComposerModelTrigger, ComposerMenu, ComposerModelItem } from "@/components/assistant-ui/elements/composer";

const models = [
  { name: "快速", meta: "$0.25/M" },
  { name: "旗舰", meta: "$3/M" },
];

export function ModelPicker() {
  const aui = useAui();
  const [selected, setSelected] = useState(models[0]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return aui.modelContext.register({
      getModelContext: () => ({ config: { modelName: selected.name } }),
    });
  }, [aui, selected]);

  return (
    <div className="relative">
      <ComposerModelTrigger model={selected.name} open={open} onClick={() => setOpen((v) => !v)} />
      <ComposerMenu open={open}>
        {models.map((entry) => (
          <ComposerModelItem
            key={entry.name}
            entry={entry}
            selected={entry.name === selected.name}
            onClick={() => {
              setSelected(entry);
              setOpen(false);
            }}
          />
        ))}
      </ComposerMenu>
    </div>
  );
}
```

**独立使用**

### 保存选择

独立版保存当前模型 ID，按模型列表渲染选项。

```tsx
"use client";

import { useState } from "react";
import { ComposerModelTrigger, ComposerMenu, ComposerModelItem, type ComposerModel } from "@/components/assistant-ui/elements/composer";

const models: ComposerModel[] = [
  { name: "快速", meta: "$0.25/M" },
  { name: "旗舰", meta: "$3/M" },
];

export function ModelPicker() {
  const [selected, setSelected] = useState(models[0]);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <ComposerModelTrigger model={selected.name} open={open} onClick={() => setOpen((v) => !v)} />
      <ComposerMenu open={open} align="end">
        {models.map((entry) => (
          <ComposerModelItem
            key={entry.name}
            entry={entry}
            selected={entry.name === selected.name}
            onClick={() => {
              setSelected(entry);
              setOpen(false);
            }}
          />
        ))}
      </ComposerMenu>
    </div>
  );
}
```

### 关闭菜单

确认选择后关闭菜单，并让触发器显示新模型。

## 结构 {#anatomy}

触发器展示当前模型，菜单显示可选项及选中状态。

```tsx
<div>
  <button aria-expanded={/* 对应槽位内容 */}>{/* 显示名称或标题 */}<svg /* 对应槽位内容 */ /></button>
  <div data-slot="composer-menu" data-open={/* 对应槽位内容 */}>
    <button data-slot="composer-menu-item" data-active={/* 区分当前选中项 */}>
      <span>{/* 显示名称或标题 */}</span>
      <span>{/* 对应槽位内容 */}</span>
      {/* 区分当前选中项 */}
    </button>
  </div>
</div>
```

模型触发器的开启与禁用状态由调用方控制。

## 示例 {#examples}

### 读取与写入

显示当前模型和更改实际请求配置是两个独立操作，分别连接。

**使用运行时**

```tsx
const modelName = useAuiState((s) => s.modelContext.modelName); // read
aui.modelContext.register({ getModelContext: () => ({ config: { modelName: "旗舰" } }) }); // write
```

### 调整触发器和菜单样式

使用相应组件的 `className` 设置布局。

```tsx
<ComposerModelTrigger model={selected.name} open={open} className="text-foreground/80" />
```

## API 参考 {#api-reference}

**使用运行时**

### 模型上下文

| 选择器 | 类型 | 说明 |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `s.modelContext.modelName` | `string \| undefined` | 模型上下文中登记的模型名称。 |
| `s.modelContext.toolNames` | `readonly string[]` | 模型上下文中可用的工具名称。 |
| `aui.modelContext.register(provider)` | `(provider: ModelContextProvider) => Unsubscribe` | 注册模型上下文提供器。 |

多个组件可以同时注册提供器。若提供器给出不同的 `modelName`，以 `priority` 最高的提供器为准。

**独立使用**

### ComposerModel

| 字段 | 类型 | 说明 |
| ------ | -------- | ---------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `meta` | `string` | 补充信息。 |

### ComposerModelTrigger

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------- | -------- | ---------------------------------------------------------- |
| `model` | `string` | 必填 | 当前模型。 |
| `open` | `boolean` | 必填 | 控制内容是否展开。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### ComposerModelItem

| 属性 | 类型 | 默认值 | 说明 |
| ---------- | --------------- | -------- | ------------------------------ |
| `entry` | `ComposerModel` | 必填 | 模型菜单中的条目。 |
| `selected` | `boolean` | 必填 | 条目是否为当前选中项。 |
