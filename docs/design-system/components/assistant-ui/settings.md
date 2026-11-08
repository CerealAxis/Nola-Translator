---
title: Settings（设置）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Settings（设置）

集中展示聊天偏好、开关和模型设置。

<demo react="assistant-ui/settings-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-settings-panel"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-settings-panel.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 把设置值注册为模型上下文

将需要传给模型的设置注册为 model context，模型请求即可读取相应值。

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAui } from "@assistant-ui/react";
import {
  SettingsPanel,
  type SettingToggle,
} from "@/components/assistant-ui/elements/settings-panel";

const MODELS = ["gpt-5.6-luna", "gpt-5.6-terra"];

export function ModelSettings() {
  const aui = useAui();
  const [model, setModel] = useState(MODELS[0]!);
  const [systemPrompt, setSystemPrompt] = useState("你是一位回答简洁的助手。");
  const [temperature, setTemperature] = useState(0.7);
  const [webSearch, setWebSearch] = useState(false);

  useEffect(() => {
    return aui.modelContext.register({
      getModelContext: () => ({
        system: systemPrompt,
        callSettings: { temperature },
        config: { modelName: model },
      }),
    });
  }, [aui, model, systemPrompt, temperature]);

  const toggles: SettingToggle[] = [
    {
      key: "web-search",
      label: "网页搜索",
      detail: "回答前先查找资料",
      on: webSearch,
    },
  ];

  return (
    <SettingsPanel
      model={model}
      models={MODELS}
      systemPrompt={systemPrompt}
      temperature={temperature}
      toggles={toggles}
      onModelChange={setModel}
      onSystemPromptChange={setSystemPrompt}
      onTemperatureChange={setTemperature}
      onToggle={(key) => key === "web-search" && setWebSearch((w) => !w)}
    />
  );
}
```

**独立使用**

### 保存设置状态

独立版由应用保存当前选择和开关，通过回调持久化。

```tsx
"use client";

import { useState } from "react";
import {
  SettingsPanel,
  type SettingToggle,
} from "@/components/assistant-ui/elements/settings-panel";

export function Settings() {
  const [model, setModel] = useState("balanced");
  const [systemPrompt, setSystemPrompt] = useState("你是一位乐于助人的助手。");
  const [temperature, setTemperature] = useState(1);
  const [toggles, setToggles] = useState<SettingToggle[]>([
    { key: "code", label: "执行代码", detail: "在沙箱中运行代码片段", on: true },
    { key: "memory", label: "记忆", detail: "在不同会话中保留信息", on: false },
  ]);

  return (
    <SettingsPanel
      model={model}
      models={["fast", "balanced", "careful"]}
      systemPrompt={systemPrompt}
      temperature={temperature}
      toggles={toggles}
      onModelChange={setModel}
      onSystemPromptChange={setSystemPrompt}
      onTemperatureChange={setTemperature}
      onToggle={(key) =>
        setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, on: !t.on } : t)))
      }
    />
  );
}
```

## 结构 {#anatomy}

面板按区域显示当前设置值及操作。开关行可配标题和说明。

```tsx
<div data-slot="settings-panel">
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <div>
      {/* 逐项渲染 */}
    </div>
  </div>
  <div>
    <span>{/* "系统提示词" */}</span>
    <textarea aria-label="系统提示词" />
  </div>
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 对应槽位内容 */}</span>
    <input type="range" aria-label="采样温度" />
  </div>
  <div>
    {/* 逐项渲染 */}
  </div>
</div>
```

显示和提交的采样温度限制在 0 到 2，`NaN` 按 0 处理。只有连接相应回调后，模型和开关选项才提供可交互控件。

## 示例 {#examples}

### 设置值的去向

界面偏好留在应用状态，需要影响模型的值再接入模型上下文。

**使用运行时**

```tsx
export async function POST(req: Request) {
  const { messages, config, system, callSettings } = await req.json();
  const result = streamText({
    abortSignal: req.signal,
    model: openai(config?.modelName ?? "gpt-5.6-luna"),
    providerOptions: { openai: { reasoningEffort: "none" } },
    temperature: callSettings?.temperature,
    system,
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

### 调整面板样式

用 `className` 调整根元素。

```tsx
<SettingsPanel className="max-w-xs" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

设置面板通过 `ModelContextProvider` 注册模型参数。`ModelContext` 接受附加到系统提示词的 `system`、包含 `temperature` 的 `callSettings`、包含 `modelName` 的 `config`，以及 `tools`。

### 模型上下文

| 选择器或方法 | 类型 | 说明 |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aui.modelContext.register(provider)` | `(provider: ModelContextProvider) => Unsubscribe` | 注册模型上下文提供器。 |
| `s.modelContext.modelName` | `string \| undefined` | 模型上下文中登记的模型名称。 |
| `s.modelContext.toolNames` | `readonly string[]` | 模型上下文中可用的工具名称。 |

**独立使用**

### SettingsPanel

| 属性 | 类型 | 默认值 | 说明 |
| ---------------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `model` | `string` | 必填 | 当前模型。 |
| `models` | `readonly string[]` | 必填 | 可选模型列表。 |
| `systemPrompt` | `string` | 必填 | 当前系统提示词。 |
| `temperature` | `number` | 必填 | 当前采样温度。 |
| `toggles` | `readonly SettingToggle[]` | 必填 | 设置项的开关列表。 |
| `onModelChange` | `(model: string) => void` |  | 选择新模型时调用。 |
| `onSystemPromptChange` | `(prompt: string) => void` |  | 系统提示词更改时调用。 |
| `onTemperatureChange` | `(temperature: number) => void` |  | 采样温度更改时调用。 |
| `onToggle` | `(key: string) => void` |  | 用户切换设置项时调用，传入该项的键与新状态。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### SettingToggle

| 字段 | 类型 | 说明 |
| -------- | --------- | ------------------------------------- |
| `key` | `string` | 设置项的标识。 |
| `label` | `string` | 要显示的标签。 |
| `detail` | `string` | 补充详情。 |
| `on` | `boolean` | 该设置项是否打开。 |
