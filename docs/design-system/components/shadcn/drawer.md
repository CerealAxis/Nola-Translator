---
title: Drawer（抽屉）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Drawer（抽屉）

用于 React 的抽屉组件。

<demo react="shadcn-base/drawer-demo.tsx" />

<div class="shadcn-doc-callout">

  抽屉组件现在使用 [Base
  UI](https://base-ui.com/react/components/drawer) 替代 Vaul。如果
  安装了之前的版本，请参阅
  [迁移指南](#migrating-from-vaul)。

</div>

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add drawer
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @base-ui/react
```

**2. 将以下代码复制并粘贴到项目中。**

<<< @/media-src/vis/shadcn-base/ui/drawer.tsx [components/ui/drawer.tsx]

**3. 根据项目配置调整导入路径。**

</template>

</ShadcnInstall>

将以下内容添加到全局样式。在 iOS Safari 中，抽屉遮罩采用绝对定位，需要给 `body` 设置定位，以便在页面滚动后仍能覆盖视口。详情请参阅 [Base UI 文档](https://base-ui.com/react/overview/quick-start#ios-26-safari)。

```css
body {
  position: relative;
}
```

## 用法 {#usage}

```tsx:line-numbers
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
```

```tsx:line-numbers
<Drawer>
  <DrawerTrigger render={<Button variant="outline" />}>Open</DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Are you absolutely sure?</DrawerTitle>
      <DrawerDescription>This action cannot be undone.</DrawerDescription>
    </DrawerHeader>
    <div className="p-4">{/* Content here */}</div>
    <DrawerFooter>
      <Button>Submit</Button>
      <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

## 组件结构 {#composition}

使用以下结构构建 `Drawer`：

```text
Drawer
├── DrawerTrigger
└── DrawerContent
    ├── DrawerHeader
    │   ├── DrawerTitle
    │   └── DrawerDescription
    └── DrawerFooter
```

`DrawerContent` 由 Base UI 的 Portal、遮罩、视口和弹出层组成。如需更细粒度的控制，也可以使用导出的 `DrawerPortal`、`DrawerOverlay` 和 `DrawerSwipeHandle`。

## 自定义尺寸 {#custom-sizes}

纵向抽屉根据内容调整高度，默认最大为 `calc(100dvh - 6rem)`。侧边抽屉的宽度为视口宽度的 `75%`，在较大的屏幕上为 `24rem`。

要自定义纵向抽屉的高度，请在 `DrawerContent` 上使用 `h-*` 和 `max-h-*` 工具类。

```tsx
<DrawerContent className="h-[50vh]">
```

要自定义侧边抽屉的宽度，请在 `DrawerContent` 上使用 `w-*` 和 `max-w-*` 工具类。

```tsx
<DrawerContent className="w-96">
```

同一个组件在多个方向渲染时，使用 `data-[swipe-axis=*]` 变体将覆盖样式限定在某一轴上。

```tsx
<DrawerContent className="data-[swipe-axis=y]:max-h-[50vh] data-[swipe-axis=x]:w-96">
```

要让抽屉中的某个区域可滚动，请将滚动容器设为 Flex 项。避免使用 `h-full`，因为当抽屉由内容决定尺寸时，百分比高度无法解析。

```tsx
<DrawerContent>
  <DrawerHeader>...</DrawerHeader>
  <div className="flex-1 overflow-y-auto p-4">{/* Scrollable content */}</div>
  <DrawerFooter>...</DrawerFooter>
</DrawerContent>
```

## 样式 {#styling}

抽屉提供用于定制样式的 CSS 变量。在 `DrawerContent` 上设置尺寸变量，在 CSS 的 `[data-slot=drawer-overlay]` 选择器中设置遮罩变量。

| 变量 | 默认值 | 说明 |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| `--drawer-inset` | `0px` | 设置抽屉与视口边缘的间距。 |
| `--drawer-bleed-background` | `var(--color-popover)` | 填补滑动超过边界时抽屉后方的空隙。 |
| `--drawer-overlay-min-opacity` | `0` | 遮罩的最低不透明度。启用吸附点时默认为 `0.5`。 |

抽屉还会设置数据属性，可在 `DrawerContent` 上用 `data-[swipe-direction=down]:` 等变体匹配，或在其后代元素上用 `group-data-[swipe-axis=y]/drawer-popup:` 匹配。

| 属性 | 值 | 设置时机 |
| ------------------------- | ----------------------------- | ------------------------------------- |
| `data-swipe-direction` | `up`、`right`、`down`、`left` | 始终设置。 |
| `data-swipe-axis` | `x`、`y` | 始终设置。 |
| `data-snap-points` | 存在 | 抽屉设有吸附点。 |
| `data-expanded` | 存在 | 抽屉位于完全展开的吸附点。 |
| `data-swiping` | 存在 | 正在滑动。 |
| `data-nested-drawer-open` | 存在 | 上方打开了嵌套抽屉。 |

## 位置 {#position}

使用 `swipeDirection` 属性设置抽屉所在的一侧。

可选值为 `up`、`right`、`down` 和 `left`。

<demo react="shadcn-base/drawer-sides.tsx" />

## 滑动手柄 {#swipe-handle}

在 `Drawer` 上使用 `showSwipeHandle` 渲染滑动手柄。

<demo react="shadcn-base/drawer-swipe-handle.tsx" />

## 嵌套 {#nested}

可以从一个抽屉内部打开另一个抽屉。父抽屉保持挂载，并堆叠在最前方抽屉的后面。

<demo react="shadcn-base/drawer-nested.tsx" />

## 非模态 {#non-modal}

设置 `modal={false}`，可在抽屉打开时与页面其他部分交互。结合 `disablePointerDismissal` 可防止按下外部区域时关闭抽屉。使用 `modal="trap-focus"` 可将焦点保留在抽屉内，同时允许自由滚动和使用指针交互。

<demo react="shadcn-base/drawer-non-modal.tsx" />

## 吸附点 {#snap-points}

使用 `snapPoints` 让抽屉吸附到预设高度。`0` 与 `1` 之间的数值表示视口比例，大于 `1` 的数值按像素值处理。字符串值支持 `px` 和 `rem` 单位。吸附点适用于纵向抽屉。

使用受控属性 `snapPoint` 和 `onSnapPointChange` 跟踪当前吸附点。完全展开时，抽屉会设置 `data-expanded` 属性，可用 `data-expanded:` 变体设置样式。

<demo react="shadcn-base/drawer-snap-points.tsx" />

## 响应式 {#responsive}

可以组合 `Dialog` 和 `Drawer` 组件来创建响应式对话框。在桌面端渲染 `Dialog` 组件，在移动端渲染 `Drawer`。

<demo react="shadcn-base/drawer-dialog.tsx" />

## 从 Vaul 迁移 {#migrating-from-vaul}

Base 版抽屉现在使用 [Base UI](https://base-ui.com/react/components/drawer) 
替代 Vaul。如果安装了之前的 Base 版抽屉，请更新代码，
改用 Base UI API。

**1. 更新依赖。**

```diff
- npm install vaul
+ npm install @base-ui/react
```

**2. 将 `direction` 替换为 `swipeDirection`。**

用 `down` 替代 `bottom`，用 `up` 替代 `top`。
`left` 和 `right` 保持原样。

```diff
- <Drawer direction="bottom">
+ <Drawer swipeDirection="down">
```

**3. 将 `asChild` 替换为 `render`。**

对于 `DrawerTrigger`，将触发元素传给 `render` 属性。

```diff
- <DrawerTrigger asChild>
-   <Button variant="outline">Open</Button>
- </DrawerTrigger>
+ <DrawerTrigger render={<Button variant="outline" />}>
+   Open
+ </DrawerTrigger>
```

对于 `DrawerClose`，将关闭元素传给 `render` 属性。

```diff
- <DrawerClose asChild>
-   <Button variant="outline">Cancel</Button>
- </DrawerClose>
+ <DrawerClose render={<Button variant="outline" />}>
+   Cancel
+ </DrawerClose>
```

**4. 更新吸附点属性。**

如果使用了吸附点，请重命名受控吸附点属性和
顺序吸附属性。

```diff
  <Drawer
    snapPoints={[0.25, 0.5, 1]}
-   activeSnapPoint={snapPoint}
-   setActiveSnapPoint={setSnapPoint}
-   snapToSequentialPoint
+   snapPoint={snapPoint}
+   onSnapPointChange={setSnapPoint}
+   snapToSequentialPoints
  >
```

**5. 更新动画和焦点属性。**

```diff
- <Drawer onAnimationEnd={(open) => setDone(open)}>
+ <Drawer onOpenChangeComplete={(open) => setDone(open)}>
```

```diff
- <DrawerContent onOpenAutoFocus={(event) => event.preventDefault()}>
+ <DrawerContent initialFocus={false}>
```

**6. 检查 Vaul 专有属性。**

Vaul 的 `handleOnly`、`repositionInputs` 和
`shouldScaleBackground` 等属性在 Base 版抽屉 API 中没有一一对应的替代项。
根据所需行为，使用 Base UI 的 `disablePointerDismissal`、`modal`、`snapPoints`
等属性，或使用受控的 `open` 状态。

```diff
- <Drawer handleOnly repositionInputs={false} shouldScaleBackground>
+ <Drawer>
```

```diff
- <Drawer dismissible={false}>
+ <Drawer disablePointerDismissal>
```

**7. 更新自定义数据属性选择器。**

将 Vaul 的 `data-vaul-drawer-direction` 选择器替换为 Base UI 的
`data-swipe-direction` 选择器。

```diff
- <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[50vh]">
+ <DrawerContent className="data-[swipe-direction=down]:max-h-[50vh]">
```

Base UI 还提供 `data-swiping`、`data-starting-style` 和
`data-ending-style` 等属性来表示滑动和过渡状态。
`DrawerContent` 的后代元素可使用 `group-data-[swipe-axis=x]/drawer-popup` 和
`group-data-[swipe-axis=y]/drawer-popup` 分别设置两个轴上的样式。

## API 参考 {#api-reference}

完整的 API 参考请参阅 [Base UI 文档](https://base-ui.com/react/components/drawer)。
