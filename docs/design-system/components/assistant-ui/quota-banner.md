---
title: Quota banner（配额横幅）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Quota banner（配额横幅）

提示配额使用情况、预计重置时间和升级入口。

<demo react="assistant-ui/quota-banner-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-quota-banner"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-quota-banner.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

### 保存用量状态

从应用状态传入计划与配额的使用情况，需要时连接升级操作。

```tsx
"use client";

import { useState } from "react";
import { QuotaBanner } from "@/components/assistant-ui/elements/quota-banner";

export function Quota() {
  const [used, setUsed] = useState(32);

  return (
    <QuotaBanner
      used={used}
      limit={50}
      unit="messages"
      resetsIn="3h 12m"
      upgradeLabel="升级"
      onUpgrade={() => (window.location.href = "/billing")}
    />
  );
}
```

### 按时钟更新 resetsIn

根据后端重置时间自行计算 `resetsIn`，并按应用的时钟更新。

```tsx
const resetsIn = formatDistanceToNowStrict(resetAt);
```

## 结构 {#anatomy}

提示条显示计划、用量进度、重置提示和可选升级入口。

```tsx
<div data-slot="quota-banner">
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <span role="meter">{/* 显示名称或标题 */}</span>
  <div>
    <span>{/* 对应槽位内容 */}</span>
    <button>{/* 对应槽位内容 */}</button>
  </div>
</div>
```

剩余额度最低显示为 0。用量达到 90% 时采用警示色，额度耗尽时采用危险色。额度上限为 0 时，用量比率按 0 处理。

## 示例 {#examples}

### 调整提示条样式

使用 `className` 调整根元素。

```tsx
<QuotaBanner className="max-w-none" /* ... */ />
```

### 从计费接口读取配额

在应用侧读取接口数据，计算用量、上限和重置时间后传给组件。

```tsx
const { data } = useSWR("/api/usage", fetcher);
if (!data) return null;

return (
  <QuotaBanner
    used={data.used}
    limit={data.limit}
    unit={data.unit}
    resetsIn={data.resetsIn}
    upgradeLabel="升级"
    onUpgrade={() => router.push("/billing")}
  />
);
```

## API 参考 {#api-reference}

### QuotaBanner

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------ | -------- | ---------------------------------------------- |
| `used` | `number` | 必填 | 已使用的额度。 |
| `limit` | `number` | 必填 | 配额或上下文窗口上限。 |
| `unit` | `string` | 必填 | 用量单位。 |
| `resetsIn` | `string` | 必填 | 距下一次重置的可读时长。 |
| `upgradeLabel` | `string` | 必填 | 升级按钮文字。 |
| `onUpgrade` | `() => void` |  | 点击升级时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
