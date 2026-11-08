---
title: Model selector（模型选择器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Model selector（模型选择器）

从分组模型中选择当前模型，支持搜索、能力说明和推理强度。

<demo react="assistant-ui/model-selector-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/model-selector"
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

可将选择注册到 assistant-ui，也可由应用独立控制。

### 添加选择器 {#add-the-picker}

在输入区内放入 `ModelSelector`，传入可选模型及默认值。

```tsx
import { ModelSelector } from "@/components/assistant-ui/elements/model-selector.aui";

function ComposerAction() {
  return (
    <ModelSelector
      models={[
        { id: "gpt-6-luna", name: "GPT-6 Luna", description: "快速高效" },
        { id: "gpt-6-sol", name: "GPT-6 Sol", description: "性能均衡" },
        { id: "gpt-6-astra", name: "GPT-6 Astra", description: "能力最强", efforts: true },
      ]}
      defaultValue="gpt-6-luna"
      defaultEffort="medium"
      size="sm"
    />
  );
}
```

### 在接口读取选择 {#read-the-selection-in-your-api-route}

运行时版本把模型名和适用的推理强度写入模型上下文，可由请求处理代码读取。

```tsx
export async function POST(req: Request) {
  const { messages, config } = await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: openai(config?.modelName ?? "gpt-6-luna"),
    providerOptions: {
      openai:
        config?.reasoningEffort !== undefined
          ? { reasoningEffort: config.reasoningEffort }
          : {},
    },
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### 自行管理选择 {#hold-the-value-yourself}

传入 `value` 和 `onValueChange`。需要受控推理强度时相应传入强度与回调。

## 结构 {#anatomy}

触发按钮显示当前模型。弹层中可组合搜索、分组、选项和强度控件。

```tsx
<button role="combobox" aria-haspopup="listbox" data-slot="model-selector-trigger" />

<div data-slot="model-selector-content"> {/* a Command (cmdk) list */}
  <input data-slot="model-selector-search" /> {/* only when searchable */}
  <div data-slot="model-selector-list">
    <div data-slot="model-selector-empty" /> {/* only when search has no matches */}
    <div data-slot="model-selector-group">
      <div data-slot="model-selector-item" /> {/* one per model */}
    </div>
  </div>
  <div data-slot="model-selector-effort" /> {/* only when the selected model declares efforts */}
</div>
```

## 示例 {#examples}

模型可以有独立的能力、可用性和强度配置。

### 推理强度 {#reasoning-efforts}

`efforts: true` 使用默认档位，也可传入自定义档位数组。没有配置的模型不会显示强度控件。

### 自定义强度界面 {#custom-effort-ui}

通过选择器上下文读取和更新强度，替换默认的强度控件。

```tsx
import { useModelSelectorEfforts } from "@/components/assistant-ui/elements/model-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function EffortDropdown() {
  const { efforts, effort, setEffort } = useModelSelectorEfforts();
  if (!efforts?.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>{efforts.find((e) => e.id === effort)?.name ?? "Select"}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={effort} onValueChange={setEffort}>
          {efforts.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 供应商标志 {#provider-logos}

通过模型的 `icon` 属性传入对应标志，在触发器和列表中显示。

```tsx
{ id: "claude-opus-5-5", name: "Claude Opus 5.5", icon: <ClaudeLogo /> }
```

### 能力元数据 {#capability-metadata}

用模型说明、图标或搜索词表达支持的功能。

### 搜索 {#search}

启用 `searchable` 后，可以搜索模型名、ID 和 `keywords`。

```tsx
<ModelSelector models={models} searchable />
{/* or, standalone: */}
<ModelSelectorContent searchable />
```

### 供应商分组与可用性 {#provider-groups-and-availability}

使用分组组织列表，通过 `disabled` 标记暂不可选的模型。

### 变体和尺寸 {#variants-and-sizes}

使用 `variant` 和 `size` 匹配输入区布局。

```tsx
<ModelSelector variant="ghost" size="lg" />
{/* or, standalone: */}
<ModelSelectorTrigger variant="ghost" size="lg" />
```

## API 参考 {#api-reference}

选择器提供预组装版本和用于自定义布局的组合入口。

### ModelSelector {#modelselector}

接收模型数组、默认选择或受控值，并提供搜索、对齐等选项。

### 注册过程 {#how-registration-works}

运行时版本在模型上下文注册当前模型与适用的强度。切换模型后更新注册数据。

### ModelSelectorRoot 与子组件 {#modelselectorroot-and-sub-components}

根节点持有选择。触发器、当前值、内容、搜索、列表、分组、选项和强度均可组合。

### ModelOption {#modeloption}

包含 `id`、`name`，以及可选的 `description`、`icon`、`disabled`、`keywords` 和 `efforts`。

### 强度辅助函数 {#effort-helpers}

用 `getModelEfforts` 展开档位，`resolveEffort` 和 `resolveModelEffort` 检查当前选择是否受模型支持。

## 模型选择面板 {#the-model-picker-design}

独立的列表面板按供应商组织模型，并呈现可用性和当前选择。

```sh
npx shadcn@latest add "@assistant-ui/elements-model-picker"
```

```tsx
"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { useEffect, useState } from "react";
import {
  ModelPicker,
  type PickableModel,
} from "@/components/assistant-ui/elements/model-picker";

export function ModelPickerPanel({
  models,
}: {
  models: readonly PickableModel[];
}) {
  const aui = useAui();
  const activeModelName = useAuiState((s) => s.modelContext.modelName);
  const [selectedId, setSelectedId] = useState(
    () => models.find((model) => model.id === activeModelName)?.id ?? models[0]!.id,
  );

  useEffect(() => {
    return aui.modelContext.register({
      getModelContext: () => ({ config: { modelName: selectedId } }),
    });
  }, [aui, selectedId]);

  return (
    <ModelPicker models={models} selectedId={selectedId} onSelect={setSelectedId} />
  );
}
```

```tsx
"use client";

import { useState } from "react";
import {
  ModelPicker,
  type PickableModel,
} from "@/components/assistant-ui/elements/model-picker";

const MODELS: PickableModel[] = [
  { id: "sonnet", name: "Claude Sonnet 5", family: "Anthropic", context: "1M", price: "$2 / 1M", capabilities: ["vision", "tools"] },
  { id: "gpt-6-sol", name: "GPT-6 Sol", family: "OpenAI", context: "1M", price: "$2 / 1M", capabilities: ["tools", "thinking"] },
];

export function ModelPickerPanel() {
  const [selectedId, setSelectedId] = useState(MODELS[0]!.id);
  return (
    <ModelPicker models={MODELS} selectedId={selectedId} onSelect={setSelectedId} />
  );
}
```

### ModelPicker {#modelpicker}

通过属性接收模型选项，向外部报告当前选中的模型。
