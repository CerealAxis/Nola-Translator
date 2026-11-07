---
title: Computer use（电脑操作）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Computer use（电脑操作）

展示助手操作的屏幕、光标轨迹和当前动作。

浏览器镶边框架围绕代理正在查看的任何内容，光标移动到每个操作，其后面有一条淡出的轨迹。对于运行时，这是分组工具调用的组合，而不是交付的基础组件。在独立版中，你可以传递步骤和活动索引。

<demo react="assistant-ui/computer-use-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-computer-use"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-computer-use.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

没有内置的“计算机使用”工具。这是你自己定义的 `computer` 工具，每个操作一次调用，通过对它的连续调用进行分组来呈现在一起。

### 将操作定义为工具调用 {#define-the-action-as-a-tool-call}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { defineToolkit } from "@assistant-ui/react";
import { MousePointer2Icon } from "lucide-react";
import { z } from "zod";

type ComputerArgs = { action: string; target: string; x: number; y: number };

const ComputerStepMarker: ToolCallMessagePartComponent<ComputerArgs> = ({ args, status }) => (
  <MousePointer2Icon
    className="absolute size-4 fill-blue-500 text-blue-500 transition-[left,top] duration-500"
    style={{ left: `${args.x}%`, top: `${args.y}%`, opacity: status?.type === "running" ? 1 : 0.4 }}
  />
);

const toolkit = defineToolkit({
  computer: {
    type: "backend",
    description: "单击、键入或滚动屏幕上的某一点。",
    parameters: z.object({ action: z.string(), target: z.string(), x: z.number(), y: z.number() }),
    render: ComputerStepMarker,
  },
});
```

   `action`、`target`、`x` 和 `y` 是此示例自己的参数模式，而不是内置形状。计算机使用提供商的真正工具定义了它需要的任何字段。

### 将连续操作集中到一个屏幕中 {#group-consecutive-actions-into-one-screen}

```tsx
import { MessagePrimitive } from "@assistant-ui/react";

function AssistantMessage() {
  return (
    <MessagePrimitive.GroupedParts
      groupBy={(part) =>
        part.type === "tool-call" && part.toolName === "computer" ? ["group-computer"] : []
      }
    >
      {({ part, children }) => {
        switch (part.type) {
          case "group-computer":
            return <div className="relative overflow-hidden rounded-2xl border">{children}</div>;
          case "tool-call":
            return part.toolUI ?? null;
          default:
            return null;
        }
      }}
    </MessagePrimitive.GroupedParts>
  );
}
```

   `groupBy` 在 `part.toolName` 上分支，而不是 `groupPartByType` 的片段类型映射，因为分组键不是片段类型，而是调用了哪个工具。组包装器是`position: relative`。每个 `ComputerStepMarker` 将自己的 `absolute` 定位在其中，因此连续的调用会布置为一条路径，无需额外的管道。

**独立版**

独立的元素是一个受控组件：你拥有步骤列表（哪一个处于活动状态）以及路径下方的屏幕内容。

### 维护步骤列表和当前步骤索引 {#hold-the-steps-and-the-active-index}

```tsx
"use client";

import { useState } from "react";
import { ComputerUse, type ComputerStep } from "@/components/assistant-ui/elements/computer-use";

const steps: ComputerStep[] = [
  { id: "1", action: "click", target: "Sign in", x: 62, y: 24 },
  { id: "2", action: "type", target: "harry@example.com", x: 40, y: 38 },
];

export function Screen() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <ComputerUse url="app.example.com/login" steps={steps} activeIndex={activeIndex}>
      <img src="/screenshot.png" alt="" className="size-full object-cover" />
    </ComputerUse>
  );
}
```

### 随运行推进更新步骤 {#advance-as-the-run-streams}

```tsx
useEffect(() => {
  const id = setInterval(() => setActiveIndex((i) => i + 1), 1200);
  return () => clearInterval(id);
}, []);
```

   `activeIndex` 在内部被限制在范围内，因此在最后一步之后继续递增是安全的。

## 结构 {#anatomy}

```tsx
<div data-slot="computer-use">
  <div>{/* traffic-light dots, url */}</div>
  <div>{/* children (the screen), trail dots, cursor */}</div>
  {/* footer: action, target, "n/total"; only when steps is non-empty */}
</div>
```

`activeIndex` 钳位到 `0…steps.length - 1` 中，因此负数或超出范围的索引仍然解析为真正的步骤，而不是没有。轨迹是活动步骤之前的两步加上活动步骤本身，不透明度为 `0.18 * (i + 1)`，淡入光标的完全不透明标记。如果步数为零，则没有光标，也没有页脚，只有页眉和 `children`。

## 示例 {#examples}

### 提供屏幕内容 {#provide-the-screen-content}

**运行时版**

第二步中的组包装器是实时屏幕所在的位置，旁边是 `children` 通过 `MessagePrimitive.GroupedParts` 提供的标记：

需要

```tsx
case "group-computer":
  return (
    <div className="relative overflow-hidden rounded-2xl border">
      <img src={screenshotUrl} alt="" className="absolute inset-0 size-full object-cover" />
      {children}
    </div>
  );
```

**独立版**

`children`：在你经过小路之前，框架不会在小路下方显示任何内容。

```tsx
<ComputerUse url={url} steps={steps} activeIndex={activeIndex}>
  <iframe src={liveViewUrl} className="size-full" />
</ComputerUse>
```

### 工具调用完成后淡出标记 {#fade-the-marker-as-the-call-settles}

**运行时版**

`ComputerStepMarker`上面已经读取了`status?.type`。调用仍然是 `"running"` 以完全不透明的方式呈现，完成的调用会变暗为 `0.4`，因此较早的操作会被视为当前操作之后的踪迹。

### 调整框架 {#restyle-the-frame}

两种用法都支持通过 `className` 调整根元素。 chrome使用共享的`field`、`mono`和`paper`标记。交通灯点和光标颜色是元素本身的文字 Tailwind 类，因此调整它们意味着直接编辑组件的 className 字符串而不是共享标记。

## API 参考 {#api-reference}

**运行时版**

没有专用的计算机使用基础组件：这是 `MessagePrimitive.GroupedParts` 加上普通的工具调用渲染器，因此下表命名了模式读取的渲染属性，而不是附带的 API 表面。

### 使用的渲染属性 {#render-props-used}

| 字段 | 类型 | 说明 |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `args` | 你工具的 `TArgs` | 无论你声明什么参数模式。上面的 `action`/`target`/`x`/`y` 是一种约定，而不是内置形状。 |
| `status` | `ToolCallMessagePartStatus` | 读取`status?.type === "running"`以区分正在进行的调用和已确定的调用。 |

**独立版**

### ComputerUse {#computeruse}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ------------------------- | -------- | ---------------------------------------------------------- |
| `url` | `string` |  | 显示在 chrome 的地址字段中。 |
| `steps` | `readonly ComputerStep[]` |  | 要跟踪的操作。 |
| `activeIndex` | `number` |  | 当前步骤的索引。被限制在范围内。 |
| `children` | `ReactNode` |  | 屏幕内容，呈现在轨迹和光标下方。 |
| `className` | `string` |  | 合并到根元素。 |

### ComputerStep {#computerstep}

| 字段 | 类型 | 说明 |
| -------- | -------- | ----------------------------------------------- |
| `id` | `string` | 反应键。 |
| `action` | `string` | Shown in the footer, e.g. `"click"`. |
| `target` | `string` | 动作作用于什么。 |
| `x`, `y` | `number` | 占帧百分比的位置，`0…100`。 |

其余 `div` 属性会传给根元素。
