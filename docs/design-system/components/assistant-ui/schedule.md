---
title: Schedule（计划任务）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Schedule（计划任务）

展示定时任务的下一次执行、历史记录和暂停开关。

<demo react="assistant-ui/schedule-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-schedule-card"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-schedule-card.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**独立使用**

### 渲染定时任务

传入计划名称、执行频率、下一次运行和历史数据。

```tsx
"use client";

import { ScheduleCard, type ScheduleRun } from "@/components/assistant-ui/elements/schedule-card";

const history: ScheduleRun[] = [
  { id: "1", at: "Today 06:00", ok: true },
  { id: "2", at: "Yesterday 06:00", ok: true },
  { id: "3", at: "Tue 06:00", ok: false },
];

export function NightlyReport() {
  return (
    <ScheduleCard
      name="每日报告"
      cadence="每天 06:00"
      nextRun="明天 06:00"
      enabled
      history={history}
    />
  );
}
```

### 连接启停开关

在切换回调中更新应用的定时任务状态，将更新后的 enabled 传回组件。

```tsx
"use client";

import { useState } from "react";

export function NightlyReport() {
  const [enabled, setEnabled] = useState(true);

  return (
    <ScheduleCard
      name="每日报告"
      cadence="每天 06:00"
      nextRun="明天 06:00"
      enabled={enabled}
      history={history}
      onToggle={async () => {
        await setScheduleEnabled("nightly-report", !enabled);
        setEnabled((prev) => !prev);
      }}
    />
  );
}
```

## 结构 {#anatomy}

卡片先显示计划与启用状态，再显示最近几次运行及各次的结果。

```tsx
<div data-slot="schedule-card">
  <div>
    <span>{/* 图标 */}</span>
    <div>
      <span>{name}</span>
      <span>{cadence}</span>
    </div>
    <button role="switch" aria-checked={enabled} />
  </div>
  <div>
    <span>下次运行</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
  <div>
    <span>近期运行</span>
    {/* 逐项渲染 */}
    <span>{/* 对应槽位内容 */}</span>
    <span>{run.at}</span>
    <span>{/* 对应槽位内容 */}</span>
  </div>
</div>
```

下一次运行行始终存在。暂停时改为显示暂停提示。开关由 `enabled` 控制，点击仅调用 `onToggle`，更新属性后才改变开关位置。

## 示例 {#examples}

### 暂停计划

关闭 enabled 后，仍可保留并查看运行历史。

```tsx
<ScheduleCard name="每日报告" cadence="每天 06:00" nextRun="明天 06:00" enabled={false} history={history} />
```

### 读取运行历史

按需要排序后提供 history。每条记录使用稳定 ID。

```tsx
<ScheduleCard
  {...rest}
  history={[
    { id: "1", at: "Today 06:00", ok: true },
    { id: "2", at: "Yesterday 06:00", ok: false },
  ]}
/>
```

### 调整卡片样式

通过 `className` 调整根元素。

```tsx
<ScheduleCard className="max-w-md rounded-3xl" {...rest} />
```

## API 参考 {#api-reference}

**独立使用**

### ScheduleCard

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ------------------------ | -------- | -------------------------------------------------------------------- |
| `name` | `string` | 必填 | 要显示的名称。 |
| `cadence` | `string` | 必填 | 计划执行频率。 |
| `nextRun` | `string` | 必填 | 下次运行时间。 |
| `enabled` | `boolean` | 必填 | 定时任务是否启用。 |
| `history` | `readonly ScheduleRun[]` | 必填 | 最近的运行记录。 |
| `onToggle` | `() => void` |  | 切换时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### ScheduleRun

| 字段 | 类型 | 说明 |
| ----- | --------- | --------------------------------------------------------- |
| `id` | `string` | 条目的稳定标识。 |
| `at` | `string` | 可读的日期或时间。 |
| `ok` | `boolean` | 这一次运行是否成功。 |

其余 `div` 属性会转发给根元素。
