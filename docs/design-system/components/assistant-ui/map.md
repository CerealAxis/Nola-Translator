---
title: Map（地图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Map（地图）

展示地点标记、路线和对应的地点列表。

MapAnswer 将位置结果放置在示意性网格上：你可以选择的引脚、它们之间的可选路线以及它们来自下方的列表。在运行时，引脚来自查找位置的工具调用。独立的你已经持有它们。

<demo react="assistant-ui/map-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-map-answer"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-map-answer.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

assistant-ui 没有地图或地理编码概念，MapAnswer 不绘制真正的图块或投影：`x` 和 `y` 是在网格上放置图钉的普通 0 到 100 百分比，而不是纬度和经度。无论查找内容如何，​​都负责在结果到达此组件之前将实际坐标转换为百分比布局。

### 渲染工具调用 {#render-the-tool-call}

```tsx
"use client";

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  MapAnswer,
  type MapPin,
} from "@/components/assistant-ui/elements/map-answer";

type FindPlacesResult = {
  pins: MapPin[];
  route: boolean;
};

export const FindPlacesToolUI: ToolCallMessagePartComponent<
  { query: string },
  FindPlacesResult
> = ({ result }) => {
  const [activeId, setActiveId] = useState("");

  if (!result) return null;
  const activePin = activeId || (result.pins[0]?.id ?? "");

  return (
    <MapAnswer
      pins={result.pins}
      activeId={activePin}
      route={result.route}
      onSelect={setActiveId}
    />
  );
};
```

### 注册工具 {#register-the-tool}

```tsx
import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { FindPlacesToolUI } from "@/components/assistant-ui/elements/find-places-tool-ui";

export const toolkit = defineToolkit({
  find_places: {
    type: "frontend",
    description: "查找需要查询的地点并将其布置在示意图上。",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => lookupPlaces(query),
    render: FindPlacesToolUI,
  },
});
```

   `lookupPlaces` 拥有坐标数学：根据整个集合的边界框标准化每个结果的真实纬度和经度，因此最接近的引脚最终在网格上靠近在一起。使用 `Tools({ toolkit })` 连接工具包；请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

在独立版中，你已经掌握了引脚、它们的布局百分比以及哪一个处于活动状态。

### 维护选中的地图标记 {#hold-the-active-pin}

```tsx
"use client";

import { useState } from "react";
import {
  MapAnswer,
  type MapPin,
} from "@/components/assistant-ui/elements/map-answer";

const PINS: MapPin[] = [
  { id: "a", label: "轮渡大厦", detail: "0.4 英里", x: 28, y: 62 },
  { id: "b", label: "科伊特塔", detail: "1.1英里", x: 55, y: 20 },
  { id: "c", label: "唐人街", detail: "0.8 英里", x: 40, y: 45 },
];

export function Places() {
  const [activeId, setActiveId] = useState(PINS[0].id);
  return (
    <MapAnswer pins={PINS} activeId={activeId} route onSelect={setActiveId} />
  );
}
```

### 替换地图标记 {#replace-the-pin-set}

   新的搜索交换整个阵列并重置哪个引脚处于活动状态。

```tsx
async function search(query: string) {
  const places = await fetchPlaces(query);
  setPins(places);
  setActiveId(places[0]?.id ?? "");
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="map-answer">
  <div>
    <svg>{/* hairline grid, plus an optional dashed route through pins in array order */}</svg>
    {/* one marker button per pin, positioned by x/y percentage */}
  </div>
  <div>
    {/* one row per pin, top-bordered, including the first */}
  </div>
</div>
```

仅当 `route` 为 true 并且至少有两个引脚时才绘制路由线。它是严格按数组顺序连接引脚的静态虚折线，而不是计算路径，因此重新排序 `pins` 会更改绘制的路线，而无需添加或删除单个引脚。 `x` 和 `y` 在 0 到 100 的视图框中按百分比放置标记。没有任何东西限制超出范围的值。活动引脚的标记变大并切换为蓝色填充。所有其他标记都保持较小的中性填充，两者共享相同的背景色环，因此它们可以在网格线上清晰地读取。单击一个标记并单击下面列表中其所在的行都会使用相同的 `pin.id` 调用 `onSelect`，因此任一者都会移动活动引脚。每个列表行都带有一个顶部分隔符（包括第一个分隔符），因为列表直接位于网格下方而不是另一行下方。空的 `pins` 数组呈现一个空网格，其细线仍然可见，下面有一个空列表。

## 示例 {#examples}

### 绘制路线 {#draw-the-route}

虚线是装饰性连接，而不是路由路径：它始终按 `pins` 顺序运行，并且从不根据活动引脚调整自身。

```tsx
<MapAnswer pins={pins} activeId={activeId} route onSelect={onSelect} />
```

### 调整地图 {#restyle-the-map}

两种用法都支持通过 `className` 调整根元素。网格后台读取共享的 `field` 标记、卡本身 `paper` 以及列表的详细信息列 `mono`，全部来自 `surfaces.tsx`。

```tsx
<MapAnswer className="max-w-none" /* ... */ />
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args` | `TArgs` | 已解析的参数。当模型仍在传输它们时部分。 |
| `argsText` | `string` | 由模型流式传输的原始 JSON 参数文本。 |
| `result` | `TResult \| undefined` | 工具完成后的返回值。运行时为 `undefined`。 |
| `status` | `ToolCallMessagePartStatus` | `status.type` 是 `"running"`、`"requires-action"`、`"complete"` 或 `"incomplete"`。 |
| `toolName` | `string` | 模型调用的工具的名称。 |
| `toolCallId` | `string` | 此调用的稳定 ID。 |
| `isError` | `boolean \| undefined` | `result` 是否表示工具执行错误。 |

在工具包条目的 `render` 字段上注册渲染器，并使用 `Tools({ toolkit })` 附加工具包。请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui) 以了解完整的渲染属性列表，包括 `addResult`、人工工具和授权请求。

**独立版**

### MapAnswer {#mapanswer}

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pins` | `readonly MapPin[]` |  | 要按顺序放置的标记。还有路线连接它们的顺序。 |
| `activeId` | `string` |  | 突出显示引脚的 ID。与 pin 不匹配的 id 不会突出显示任何内容。 |
| `route` | `boolean` |  | 按数组顺序通过 `pins` 绘制虚线。即使 `true` 时，两个引脚下方也没有线路。 |
| `onSelect` | `(id: string) => void` |  | 使用引脚的 `id` 从其标记或其列表行进行调用。如果没有它，两个表面都会呈现为非交互式地图内容。 |
| `className` | `string` |  | 合并到根元素。 |

### MapPin {#mappin}

| 字段 | 类型 | 说明 |
| -------- | -------- | ------------------------------------------------------- |
| `id` | `string` |  |
| `label` | `string` | 标记 `aria-label` 和列表行的主要文本。 |
| `detail` | `string` | 列表行中的辅助文本，例如距离。 |
| `x` | `number` | 水平位置，0% 到 100%。不是经度。 |
| `y` | `number` | 垂直位置，0% 到 100%。不是纬度。 |

其余 `div` 属性会传给根元素。
