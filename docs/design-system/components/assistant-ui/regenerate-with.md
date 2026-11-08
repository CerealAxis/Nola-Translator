---
title: Regenerate with（切换模型重新生成）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Regenerate with（切换模型重新生成）

为同一条消息选择其他模型并重新生成回复。

RegenerateMenu 将重新生成操作变成一个小选择器：打开它，查看标记了当前选项的选项，然后选择一个再试一次。在运行时选择一个选项后，将开始执行你的选择的新运行。在独立版中，你拥有开放状态和选择权。

<demo react="assistant-ui/regenerate-with-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-regenerate-menu"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-regenerate-menu.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`aui.message.reload(config)` 开始当前轮次的新运行，并且 `config.runConfig.custom` 不受影响地到达你的模型适配器。 assistant-ui 在运行时没有内置模型字段。使用 `useLocalRuntime` 和 `ChatModelAdapter`，`run(options)` 接收配置为 `options.runConfig`，因此适配器可以读取该运行的选择，而无需更改以后使用的内容。

### 用选中的模型重新生成 {#wire-picks-to-reload}

```tsx
"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/react";
import { RegenerateMenu, type RegenerateOption } from "@/components/assistant-ui/elements/regenerate-menu";

const MODELS: RegenerateOption[] = [
  { id: "opus", label: "使用 Opus 5 重试", detail: "较慢" },
  { id: "sonnet", label: "用 Sonnet 5 重试", detail: "平衡" },
  { id: "haiku", label: "用俳句 4.5 重试", detail: "最快" },
];

function RegenerateWith({ currentModel }: { currentModel: string }) {
  const aui = useAui();
  const [open, setOpen] = useState(false);

  return (
    <RegenerateMenu
      options={MODELS}
      open={open}
      currentId={currentModel}
      onOpenChange={setOpen}
      onPick={(id) => {
        aui.message.reload({ runConfig: { custom: { model: id } } });
        setOpen(false);
      }}
    />
  );
}
```

### 在模型端读取选项 {#read-the-pick-on-the-model-side}

```tsx
import type { ChatModelAdapter } from "@assistant-ui/react";

export const adapter: ChatModelAdapter = {
  async run({ messages, runConfig, abortSignal }) {
    const model = (runConfig.custom?.model as string | undefined) ?? "sonnet";
    // call `model` for this run
  },
};
```

**独立版**

独立版，菜单完全控制：打开状态、当前选择以及选择上发生的情况都是你的。

### 维护菜单开关和当前模型 {#hold-the-open-and-current-state}

```tsx
"use client";

import { useState } from "react";
import { RegenerateMenu, type RegenerateOption } from "@/components/assistant-ui/elements/regenerate-menu";

const OPTIONS: RegenerateOption[] = [
  { id: "opus", label: "使用 Opus 5 重试", detail: "较慢" },
  { id: "sonnet", label: "用 Sonnet 5 重试", detail: "平衡" },
];

export function Answer() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("sonnet");

  return (
    <RegenerateMenu
      options={OPTIONS}
      open={open}
      currentId={model}
      onOpenChange={setOpen}
      onPick={(id) => {
        setModel(id);
        setOpen(false);
        regenerate(id);
      }}
    />
  );
}
```

### 自己处理外部交互 {#handle-outside-interaction-yourself}

   该组件没有内置的外部点击或转义处理。它是 `open` 后面的裸条件渲染。如果你需要菜单自行关闭，请将其包装在你自己的弹出框基础组件中，或者自己监听外部点击。

## 结构 {#anatomy}

```tsx
<div data-slot="regenerate-menu">
  <button aria-expanded aria-label="使用不同模型重新生成" />
  {open && (
    <div>
      {/* one row per option: its label, and "current" in place of the detail for the active one */}
    </div>
  )}
</div>
```

没有内置外部点击、Escape 或键盘漫游。每一行都是一个普通按钮。活动选项 (`option.id === currentId`) 显示文字文本“current”来代替其自己的 `detail`，因此碰巧读取“current”的 `detail` 字符串与真实的字符串无法区分。

## 示例 {#examples}

### 用同一个模型重新生成 {#regenerating-with-the-same-model}

**运行时版**

`reload()` 没有配置，按原样重试当前轮次。仅当你需要不同的模型时才需要 `runConfig.custom` 中的覆盖：

```tsx
<button onClick={() => aui.message.reload()}>再试一次</button>
```

**独立版**

无需打开菜单即可进行选择。直接调用 `onPick`，例如通过绑定到当前模型 ID 的键盘快捷键。

```tsx
onPick(currentId);
```

### 调整触发器和菜单 {#restyle-the-trigger-and-menu}

两种用法都支持通过 `className` 调整根元素。下拉菜单从 `surfaces.tsx` 读取共享的 `floating` 表面，与其他地方使用的标记弹出窗口和工具提示相同。

```tsx
<RegenerateMenu className="gap-1" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 消息状态 {#message-state}

| 选择器/方法 | 类型 | 说明 |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `aui.message.reload(config?)` | `(config?: { runConfig?: RunConfig }) => void` | 本轮次开始新的运行。 `runConfig.custom` 到达你的 `ChatModelAdapter` 作为 `options.runConfig.custom`，未受影响。 |
| `RunConfig` | `{ custom?: Record<string, unknown> }` | `reload` 的 `runConfig` 接受的形状。 assistant-ui没有内置模型字段。你读回的关键是你自己的惯例。 |

**独立版**

### RegenerateMenu {#regeneratemenu}

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `options` | `readonly RegenerateOption[]` |  | 提供的替代方案。 |
| `open` | `boolean` |  | 是否显示下拉菜单。 |
| `currentId` | `string` |  | Id 显示为“当前”。不匹配的 id 标记没有当前行。 |
| `onOpenChange` | `(open: boolean) => void` |  | 按下触发器时调用，并带有下一个打开值。仅当提供此触发器时，触发器才会呈现。 |
| `onPick` | `(id: string) => void` |  | 当按下一行时调用。如果没有它，选项将呈现为非交互式行。不关闭菜单本身。 |
| `className` | `string` |  | 合并到根元素。 |

### RegenerateOption {#regenerateoption}

| 字段 | 类型 | 说明 |
| -------- | -------- | ---------------------------------------------- |
| `id` | `string` |  |
| `label` | `string` |  |
| `detail` | `string` | 显示除当前选项之外的每个选项。 |

其余 `div` 属性会传给根元素。
