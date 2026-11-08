---
title: Geo map（地理地图）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Geo map（地理地图）

根据坐标绘制瓦片地图和路线，并提供可访问的地点列表。

GeoMap 为工具结果提供了真实的地理框架。它仅在浏览器中加载 Leaflet，保留位置列表可供键盘和屏幕阅读器用户使用，并在坐标不是答案时将 MapAnswer 保留为无依赖性原理图选项。

GeoMap 导入 `leaflet/dist/leaflet.css` 本身。Pages Router 应用程序会在 `pages/_app` 中导入该样式表。

<demo react="assistant-ui/geo-map-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-geo-map"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-geo-map.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

后端位置搜索返回 `{ places, routes }`，然后工具渲染器将这些坐标直接传递到 GeoMap。一旦结果到达，地图就准备好了，而消息的其余部分可以解释为什么这些地方很重要。

### 渲染后端结果 {#render-the-backend-result}

```tsx
"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  GeoMap,
  type GeoMapPlace,
  type GeoMapRoute,
} from "@/components/assistant-ui/elements/geo-map";

type FindPlacesResult = {
  places: GeoMapPlace[];
  routes: GeoMapRoute[];
};

export const FindPlacesToolUI: ToolCallMessagePartComponent<
  { query: string },
  FindPlacesResult
> = ({ result }) => {
  if (!result) return null;
  return <GeoMap places={result.places} routes={result.routes} />;
};
```

### 从工具返回坐标 {#return-coordinates-from-the-tool}

   后端工具应以 WGS 84 顺序返回纬度和经度，每个地点为 `{ lat, lng }`，每个路线点为 `[lat, lng]`。 GeoMap 在绘制或列出非有限值和超出地理边界的值之前会忽略它们。

```ts
return {
  places: await findPlaces(query),
  routes: await findWalkingRoutes(query),
};
```

**独立版**

独立，通过任何数据源的地点和路线点。如果没有 `selectedId`，GeoMap 将选择其第一个有效位置并自行维护选择。

### 显示结果 {#show-a-result}

```tsx
import { GeoMap } from "@/components/assistant-ui/elements/geo-map";

export function Nearby({ places, routes }) {
  return <GeoMap places={places} routes={routes} />;
}
```

## 结构 {#anatomy}

```tsx
<div data-slot="geo-map">
  <div role="region" aria-label="3处地图" />
  <ol>
    <li><button aria-current="true">放置标签、详细信息和坐标</button></li>
  </ol>
</div>
```

纸卡包含印刷地图内容，而不是其他带边框的面板。 Leaflet在地图获得焦点后拥有键盘缩放功能。每个地点下方都有一个匹配列表按钮，当前地点以 `aria-current` 公布。选择标记或按钮平移到该位置。路线线和地图边界使用每个有效坐标。

## 示例 {#examples}

### 绘制路线 {#draw-a-route}

路线是提供的路径，而不是 GeoMap 计算的方向。有效点少于两个的路线不会绘制。

```tsx
<GeoMap
  places={places}
  routes={[
    {
      id: "morning-walk",
      label: "晨间散步",
      points: [
        [40.7412, -73.9896],
        [40.7398, -73.9911],
      ],
    },
  ]}
/>
```

### 使用自定义地图瓦片 {#use-custom-tiles}

如果没有 `tileUrl`，地图将在页面墨水中绘制公共 OpenStreetMap 图块：浅色页面上的灰度，深色页面上的反转。 `tileUrl` 和 `attribution` 将其指向你自己的图块提供商，并且自定义图块的显示方式与提供商绘制的完全相同。

```tsx
<GeoMap
  places={places}
  tileUrl="https://tiles.example.com/{z}/{x}/{y}.png"
  attribution="© Example Maps"
/>
```

公共 OpenStreetMap 图块服务器适用于 [OpenStreetMap 图块使用策略 ](https://operations.osmfoundation.org/policies/tiles/) 下的轻度使用，该策略排除了应用程序将其所有流量发送到那里的情况。对于生产，请将 `tileUrl` 设置为您拥有帐户的提供商，并保持其归属可见。这两个属性都是应用程序配置：Leaflet 将 `attribution` 呈现为 HTML，因此切勿从工具或模型输出中填充其中之一。

### 控制选择 {#control-the-selection}

当答案的另一部分也需要选择当前位置时，通过 `selectedId`。

```tsx
const [selectedId, setSelectedId] = useState(places[0]?.id);

<GeoMap
  places={places}
  routes={routes}
  selectedId={selectedId}
  onSelect={setSelectedId}
/>
```

## API 参考 {#api-reference}

**运行时版**

### 工具调用渲染属性 {#tool-call-render-props}

| 属性 | 类型 | 说明 |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `args` | `TArgs` | 已解析的工具参数，在它们流式传输时是部分的。 |
| `result` | `{ places: GeoMapPlace[]; routes: GeoMapRoute[] } \| undefined` | 工具完成后的后端结果。 |
| `status` | `ToolCallMessagePartStatus` | 工具生命周期状态。 |
| `toolName` | `string` | 后端工具名称。 |

在工具包条目的 `render` 字段上注册渲染器。有关完整的渲染属性列表，请参阅[工具 UI](https://www.assistant-ui.com/docs/tools/tool-ui)。

**独立版**

### GeoMap {#geomap}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ----------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `places` | `readonly GeoMapPlace[]` |  | 按显示顺序标记和列出的位置。无效坐标将被忽略。 |
| `routes` | `readonly GeoMapRoute[]` |  | 提供通过有效坐标绘制的路径。 |
| `selectedId` | `string` |  | 受控当前位置。 |
| `onSelect` | `(id: string) => void` |  | 从标记或列表按钮调用。 |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | 默认图块的着墨方式。 Auto 遵循 Tailwind 的 `dark` 变体，就像套件的其余部分一样，因此图块会随着页面的主题而切换。 |
| `tileUrl` | `string` | OpenStreetMap | 你的提供商的图块 URL 模板，如提供商绘制的那样显示。 |
| `attribution` | `string` |  | 替换默认图块属性。呈现为 HTML，因此仅传递可信文本。 |
| `height` | `number` | `260` | 地图高度（以像素为单位）。 |
| `className` | `string` |  | 合并到根元素。 |

### GeoMapPlace {#geomapplace}

| 字段 | 类型 | 说明 |
| ------------- | -------- | ------------------------------------- |
| `id` | `string` | 稳定选择id。 |
| `lat` | `number` | 纬度从 `-90` 到 `90`。 |
| `lng` | `number` | 从 `-180` 到 `180` 的经度。 |
| `label` | `string` | 标记标题和列表标签。 |
| `description` | `string` | 列表标签下方的可选详细信息。 |

### GeoMapRoute {#geomaproute}

| 字段 | 类型 | 说明 |
| -------- | ----------------------- | ------------------------------------------ |
| `id` | `string` | 稳定的路由ID。 |
| `points` | `readonly [lat, lng][]` | 绘制顺序中的路线坐标。 |
| `label` | `string` | 应用数据的可选路由标签。 |

其余 `div` 属性会传给根元素。
