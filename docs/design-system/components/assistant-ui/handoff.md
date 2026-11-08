---
title: Handoff（交接）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Handoff（交接）

呈现从一个代理转交给另一个代理的过程及携带的上下文。

<demo react="assistant-ui/handoff-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-agent-handoff"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-agent-handoff.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**独立使用**

### 显示交接中状态

传入 from、to、reason 和 carried，并将 settled 设为 false。

```tsx
"use client";

import { AgentHandoff } from "@/components/assistant-ui/elements/agent-handoff";

export function RoutingHandoff() {
  return (
    <AgentHandoff
      from="路由代理"
      to="账单代理"
      reason="问题涉及退款，交给账单代理处理。"
      carried={["order #48213", "客户等级：专业版"]}
      settled={false}
    />
  );
}
```

### 接手后标记完成

新代理接手后，将 settled 设为 true。

```tsx
"use client";

import { useState } from "react";

export function RoutingHandoff() {
  const [settled, setSettled] = useState(false);

  return (
    <AgentHandoff
      from="路由代理"
      to="账单代理"
      reason="问题涉及退款，交给账单代理处理。"
      carried={["order #48213"]}
      settled={settled}
    />
  );
}
```

## 结构 {#anatomy}

顶部并列显示交出和接手的代理，下方解释原因，并按需列出带走的上下文。

```tsx
<div data-slot="agent-handoff">
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <svg>{/* 对应槽位内容 */}</svg>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <p>{reason}</p>
  <div>{/* 逐项渲染 */}</div>
</div>
```

交接时箭头和接手代理突出显示。完成后原代理淡出，箭头与接手代理改用中性色调。

## 示例 {#examples}

### 不带上下文的交接

传入 carried={[]}，省略上下文列表。

```tsx
<AgentHandoff from="规划代理" to="执行代理" reason="计划已制定。" carried={[]} settled />
```

### 用实际事件标记完成

在接手确认事件到达后更新 settled。

```tsx
useEffect(() => {
  const unsubscribe = subscribeToAgentEvents((event) => {
    if (event.type === "agent_took_over" && event.agent === "账单代理") {
      setSettled(true);
    }
  });
  return unsubscribe;
}, []);
```

### 调整交接卡片样式

通过 `className` 调整根元素布局。

```tsx
<AgentHandoff className="max-w-md gap-3" {...rest} />
```

## API 参考 {#api-reference}

**独立使用**

### AgentHandoff

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------- | -------- | -------------------------------------------------------------------- |
| `from` | `string` | 必填 | 原先负责工作的代理。 |
| `to` | `string` | 必填 | 接手的代理。 |
| `reason` | `string` | 必填 | 原因或补充说明。 |
| `carried` | `readonly string[]` | 必填 | 随交接传递的上下文条目。 |
| `settled` | `boolean` | 必填 | 是否已确认接手。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
