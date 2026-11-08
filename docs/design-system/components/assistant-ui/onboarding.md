---
title: Onboarding（首次引导）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Onboarding（首次引导）

按步骤引导用户了解聊天功能，完成后进入会话。

<demo react="assistant-ui/onboarding-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-onboarding"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-onboarding.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 结束引导后转入会话

将完成操作连接到当前会话入口，或通过运行时创建新的会话。

```tsx
"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/react";
import {
  Onboarding,
  type OnboardingStep,
} from "@/components/assistant-ui/elements/onboarding";

const STEPS: OnboardingStep[] = [
  { title: "随便问点什么", body: "输入问题即可得到回答。", example: "总结此 PDF" },
  { title: "调用工具执行操作", body: "授权工具后，助手可以搜索、运行代码或调用 API。", example: "查看东京天气" },
  { title: "重新生成会创建回复分支", body: "重新生成会保留原回复，可以在不同版本之间切换。", example: "在回复的 n / m 控件中切换版本" },
];

export function FirstRun({ onFinish }: { onFinish: () => void }) {
  const aui = useAui();
  const [index, setIndex] = useState(0);
  const last = index >= STEPS.length - 1;

  const finish = () => {
    aui.threads.switchToNewThread();
    onFinish();
  };

  return (
    <Onboarding
      steps={STEPS}
      index={index}
      onNext={() => (last ? finish() : setIndex((i) => i + 1))}
      onSkip={finish}
    />
  );
}
```

**独立使用**

### 保存步骤索引

独立版保存当前步骤索引，连接继续与完成动作。

```tsx
"use client";

import { useState } from "react";
import {
  Onboarding,
  type OnboardingStep,
} from "@/components/assistant-ui/elements/onboarding";

const steps: OnboardingStep[] = [
  { title: "欢迎", body: "开始前了解三项功能。", example: "…" },
  { title: "用日常语言提问", body: "无需特殊语法。", example: "v4 有哪些变化？" },
];

export function Tour({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const last = index >= steps.length - 1;

  return (
    <Onboarding
      steps={steps}
      index={index}
      onNext={() => (last ? onDone() : setIndex(index + 1))}
      onSkip={onDone}
    />
  );
}
```

## 结构 {#anatomy}

每一步展示图标、标题、正文与导航。最后一步提供完成动作。

```tsx
<div data-slot="onboarding">
  <div>
    {/* 当前步骤信息 */}
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 当前步骤信息 */}</span>
    <p>{/* 当前步骤信息 */}</p>
    <span>{/* 当前步骤信息 */}</span>
  </div>
  <div>
    <span>{/* 当前步骤信息 */}</span>
    <button>{/* 对应槽位内容 */}</button>
    <button>{/* 当前步骤信息 */}</button>
  </div>
</div>
```

没有步骤时不渲染。`index` 向下取整后限制在有效范围。继续和跳过仅通知调用方，进度圆点不可点击。

## 示例 {#examples}

### 返回上一步

为应用增加返回操作，并将步骤索引减一。在首步保持边界。

```tsx
<button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))}>
  返回
</button>
```

### 调整引导样式

用 `className` 调整引导区域的布局。

```tsx
<Onboarding className="max-w-xs" /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

调用方管理引导状态，完成时通过运行时进入新会话。

### 会话列表

| 方法 | 类型 | 说明 |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `aui.threads.switchToNewThread()` | `() => void` | 新建并切换会话。 |

**独立使用**

### Onboarding

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `steps` | `readonly OnboardingStep[]` | 必填 | 按执行或展示顺序排列的步骤。 |
| `index` | `number` | 必填 | 当前引导步骤的索引。 |
| `onNext` | `() => void` |  | 继续到下一步或完成时调用。 |
| `onSkip` | `() => void` |  | 跳过引导时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。

### OnboardingStep

| 字段 | 类型 | 说明 |
| --------- | -------- | ------------------------------------------------------- |
| `title` | `string` | 标题。 |
| `body` | `string` | 要展示或插入的正文。 |
| `example` | `string` | 该引导步骤的演示内容。 |
