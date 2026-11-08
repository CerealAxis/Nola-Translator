---
title: Agent card（代理卡片）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Agent card（代理卡片）

展示代理信息、可用技能和连接入口。

<demo react="assistant-ui/agent-card-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-agent-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-agent-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 连接代理

连接 A2A 代理，使用运行时获取远程代理卡片。

```tsx
"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useA2ARuntime } from "@assistant-ui/react-a2a";

export function A2AProvider({ children }: { children: React.ReactNode }) {
  const runtime = useA2ARuntime({ baseUrl: "https://weather-agent.example.com" });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

需要连接远程代理时，参阅 [A2A 运行时](https://www.assistant-ui.com/docs/runtimes/a2a)。

### 渲染发现的代理卡片

使用 `useA2AAgentCard` 获取卡片，映射到 `AgentCard` 的展示字段。

```tsx
"use client";

import { useA2AAgentCard } from "@assistant-ui/react-a2a";
import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

export function ConnectedAgentCard() {
  const agentCard = useA2AAgentCard();
  if (!agentCard) return null;

  return (
    <AgentCard
      name={agentCard.name}
      description={agentCard.description}
      provider={agentCard.provider?.organization ?? ""}
      version={agentCard.version}
      endpoint={agentCard.supportedInterfaces[0]?.url ?? ""}
      skills={agentCard.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
      }))}
      model="gpt-6-astra"
      connected
    />
  );
}
```

**独立使用**

### 从已有数据渲染

应用也可直接传入已有名称、提供方、版本、模型、端点和技能，并用 connected 与 `onConnect` 连接交互。

```tsx
import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

export default function AgentPage() {
  return (
    <AgentCard
      name="天气助手"
      description="回答关于实时天气和天气预报的问题。"
      provider="Acme Corp"
      version="1.4.0"
      model="gpt-6-astra"
      endpoint="weather-agent.example.com"
      skills={[
        { name: "get_forecast", description: "查看指定地点未来五天的预报" },
        { name: "get_alerts", description: "当前生效的恶劣天气预警" },
      ]}
      connected={false}
      onConnect={() => connectToAgent("weather-agent")}
    />
  );
}
```

## 结构 {#anatomy}

顶部展示代理名称和版本，中部显示描述和技能，底部显示模型、端点与连接按钮。

```tsx
<div data-slot="agent-card">
  <div>
    <span>{/* 图标 */}</span>
    <div>
      <span>{name} <span>v{version}</span></span>
      <span>{provider}</span>
    </div>
  </div>
  <p>{description}</p>
  <div>{/* 逐项渲染 */}</div>
  <div>
    <span>{endpoint}</span>
    <span>{model}</span>
  </div>
  <button>{connected ? "已连接" : "连接"}</button>
</div>
```

空间不足时截断名称、提供方和端点，模型名保持完整。已连接时按钮禁用并显示勾号。技能为空时省略技能列表。

## 示例 {#examples}

### 技能列表

为每项传 name 和 description。没有技能时传空数组。

```tsx
<AgentCard
  {...rest}
  skills={[
    { name: "search_docs", description: "对已索引的文档进行全文搜索" },
    { name: "summarize", description: "提取文档要点" },
  ]}
/>
```

### 从自己的代理目录读取

调用应用的代理目录接口，把返回的字段映射为 `AgentCard` 的属性。

**独立使用**

```tsx
"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/assistant-ui/elements/agent-card";

export function AgentDirectoryCard({ id }: { id: string }) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((res) => res.json())
      .then(setAgent);
  }, [id]);

  if (!agent) return null;
  return <AgentCard {...agent} onConnect={() => selectAgent(id)} />;
}
```

### 调整卡片样式

给根元素传入 `className`。

```tsx
<AgentCard className="max-w-md rounded-3xl" {...rest} />
```

## API 参考 {#api-reference}

**使用运行时**

### Hook

| Hook | 返回值 | 说明 |
| ------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `useA2AAgentCard()` | `A2AAgentCard \| undefined` | 返回已连接代理的 A2A 卡片，获取完成前为 undefined。 |

### 将 A2AAgentCard 映射到 AgentCard

| `AgentCard` 属性 | 来源 |
| ---------------- | --------------------------------------------------------------------------- |
| `name` | `agentCard.name` |
| `description` | `agentCard.description` |
| `provider` | `agentCard.provider?.organization` |
| `version` | `agentCard.version` |
| `endpoint` | `agentCard.supportedInterfaces[0]?.url` |
| `skills` | `agentCard.skills.map(s => ({ name: s.name, description: s.description }))` |
| `model` | A2A 代理卡片没有此字段，需要自行提供模型名称。 |
| `connected` | 读取到代理卡片后为 true，A2A 无需单独执行连接步骤。 |

**独立使用**

### AgentCard

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ----------------------- | -------- | ------------------------------------------------------------- |
| `name` | `string` | 必填 | 要显示的名称。 |
| `description` | `string` | 必填 | 代理介绍。技能项中的描述显示在标签旁。 |
| `provider` | `string` | 必填 | 代理提供方。 |
| `version` | `string` | 必填 | 代理版本。 |
| `model` | `string` | 必填 | 页脚显示的模型名称。A2A 代理卡片没有该字段，需要自行提供。 |
| `endpoint` | `string` | 必填 | 代理服务地址。 |
| `skills` | `readonly AgentSkill[]` | 必填 | 代理提供的技能列表。 |
| `connected` | `boolean` | 必填 | 是否已连接到代理。 |
| `onConnect` | `() => void` |  | 点击连接按钮时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### AgentSkill

| 字段 | 类型 | 说明 |
| ------------- | -------- | --------------------------------- |
| `name` | `string` | 要显示的名称。 |
| `description` | `string` | 代理介绍。技能项中的描述显示在标签旁。 |

其余 `div` 属性会转发给根元素。
