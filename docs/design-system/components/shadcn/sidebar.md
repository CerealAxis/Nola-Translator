---
title: Sidebar（侧栏）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Sidebar（侧栏）

支持组合、主题化和自定义的侧边栏组件。

<figure class="flex flex-col gap-4">
  

<demo react="shadcn-base/sidebar-demo.tsx" />

  <figcaption class="text-center text-sm">
    可折叠为图标的侧边栏。
  </figcaption>
</figure>

侧边栏是构建起来最复杂的组件之一。它在任何应用中都处于核心位置，
而且往往包含许多相互配合的部件。

现在，我们有了一个稳固的基础，可以在其上继续构建。支持组合、主题化，
也支持自定义。

[浏览区块库](https://ui.shadcn.com/blocks)。

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add sidebar
```

</template>

<template #manual>

<<< @/media-src/vis/shadcn-base/ui/sidebar.tsx [components/ui/sidebar.tsx]

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers [app/layout.tsx]
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main>
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )
}
```

```tsx:line-numbers [components/app-sidebar.tsx]
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup />
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}
```

## 组件结构 {#composition}

使用以下结构构建 `Sidebar` 布局：

```text
SidebarProvider
├── Sidebar
│   ├── SidebarHeader
│   ├── SidebarContent
│   │   ├── SidebarGroup
│   │   │   ├── SidebarGroupLabel
│   │   │   ├── SidebarGroupAction
│   │   │   ├── SidebarGroupContent
│   │   │   └── SidebarMenu
│   │   │       ├── SidebarMenuItem
│   │   │       │   ├── SidebarMenuButton
│   │   │       │   ├── SidebarMenuAction
│   │   │       │   └── SidebarMenuBadge
│   │   │       └── SidebarMenuItem
│   │   │           ├── SidebarMenuButton
│   │   │           └── SidebarMenuSub
│   │   │               ├── SidebarMenuSubItem
│   │   │               └── SidebarMenuSubItem
│   │   └── SidebarGroup
│   │       └── SidebarMenu
│   │           ├── SidebarMenuItem
│   │           └── SidebarMenuItem
│   ├── SidebarFooter
│   └── SidebarRail
├── SidebarInset
└── SidebarTrigger
```

## 结构 {#structure}

- **SidebarProvider** — 管理折叠状态，并向子组件提供侧边栏上下文。
- **Sidebar** — 主要的可折叠侧边栏面板。
- **SidebarHeader** — 固定在顶部，可放置品牌标识、标题或工作区切换器。
- **SidebarFooter** — 固定在底部，可放置用户菜单、设置或操作。
- **SidebarContent** — 顶部和底部之间的可滚动区域。
- **SidebarGroup** — 将相关导航分组，可选配标签、操作和内容区域。
- **SidebarMenu** / **SidebarMenuItem** — 用于组织链接、徽章、操作和嵌套子菜单的菜单结构。
- **SidebarRail** — 可调整尺寸时，用于调整侧边栏宽度的手柄。
- **SidebarInset** — 使用 `inset` 变体时包裹主要内容。
- **SidebarTrigger** — 用于展开或折叠侧边栏的控件。

<img src="https://ui.shadcn.com/images/sidebar-structure.png" alt="侧边栏结构" class="mt-6 w-full overflow-hidden rounded-2xl border dark:hidden">
<img src="https://ui.shadcn.com/images/sidebar-structure-dark.png" alt="侧边栏结构" class="mt-6 hidden w-full overflow-hidden rounded-2xl border dark:block">

## SidebarProvider {#sidebarprovider}

`SidebarProvider` 组件向 `Sidebar` 组件提供侧边栏上下文。应用应始终包裹在 `SidebarProvider` 组件中。

### 属性 {#props}

| 名称 | 类型 | 描述 |
| -------------- | ------------------------- | -------------------------------------------- |
| `defaultOpen` | `boolean` | 侧边栏的默认展开状态。 |
| `open` | `boolean` | 侧边栏的展开状态（受控）。 |
| `onOpenChange` | `(open: boolean) => void` | 设置侧边栏的展开状态（受控）。 |

### 宽度 {#width}

如果应用中只有一个侧边栏，可以通过 `sidebar.tsx` 中的 `SIDEBAR_WIDTH` 和 `SIDEBAR_WIDTH_MOBILE` 变量设置侧边栏宽度。

```tsx:line-numbers [components/ui/sidebar.tsx]
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
```

如果应用中有多个侧边栏，可以在 `style` 属性中使用 `--sidebar-width` 和 `--sidebar-width-mobile` CSS 变量。

```tsx:line-numbers
<SidebarProvider
  style={
    {
      "--sidebar-width": "20rem",
      "--sidebar-width-mobile": "20rem",
    } as React.CSSProperties
  }
>
  <Sidebar />
</SidebarProvider>
```

### 键盘快捷键 {#keyboard-shortcut}

在 Mac 上使用 `cmd+b` 快捷键，在 Windows 上使用 `ctrl+b` 快捷键，即可切换侧边栏。

```tsx:line-numbers [components/ui/sidebar.tsx]
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
```

## Sidebar {#sidebar}

主要的 `Sidebar` 组件用于渲染可折叠侧边栏。

### 属性 {#props-1}

| 属性 | 类型 | 描述 |
| ------------- | --------------------------------- | --------------------------------- |
| `side` | `left` 或 `right` | 侧边栏所在的一侧。 |
| `variant` | `sidebar`、`floating` 或 `inset` | 侧边栏的变体。 |
| `collapsible` | `offcanvas`、`icon` 或 `none` | 侧边栏的折叠方式。 |

| 属性 | 描述 |
| ----------- | ------------------------------------------------------------ |
| `offcanvas` | 从左侧或右侧滑入的可折叠侧边栏。 |
| `icon` | 可折叠为图标的侧边栏。 |
| `none` | 不可折叠的侧边栏。 |

<div class="shadcn-doc-callout">

  **注意：**使用 `inset` 变体时，请记得用 `SidebarInset` 组件
  包裹主要内容。

</div>

```tsx:line-numbers
<SidebarProvider>
  <Sidebar variant="inset" />
  <SidebarInset>
    <main>{children}</main>
  </SidebarInset>
</SidebarProvider>
```

## useSidebar {#usesidebar}

`useSidebar` Hook 用于控制侧边栏。

```tsx:line-numbers
import { useSidebar } from "@/components/ui/sidebar"

export function AppSidebar() {
  const {
    state,
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  } = useSidebar()
}
```

| 属性 | 类型 | 描述 |
| --------------- | ------------------------- | --------------------------------------------- |
| `state` | `expanded` 或 `collapsed` | 侧边栏的当前状态。 |
| `open` | `boolean` | 侧边栏是否展开。 |
| `setOpen` | `(open: boolean) => void` | 设置侧边栏的展开状态。 |
| `openMobile` | `boolean` | 侧边栏在移动端是否展开。 |
| `setOpenMobile` | `(open: boolean) => void` | 设置侧边栏在移动端的展开状态。 |
| `isMobile` | `boolean` | 是否处于移动端。 |
| `toggleSidebar` | `() => void` | 切换侧边栏。适用于桌面端和移动端。 |

## SidebarHeader {#sidebarheader}

使用 `SidebarHeader` 组件为侧边栏添加固定在顶部的区域。

```tsx:line-numbers [components/app-sidebar.tsx]
<Sidebar>
  <SidebarHeader>
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton />}>
            Select Workspace
            <ChevronDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <span>Acme Inc</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>
</Sidebar>
```

## SidebarFooter {#sidebarfooter}

使用 `SidebarFooter` 组件为侧边栏添加固定在底部的区域。

```tsx:line-numbers
<Sidebar>
  <SidebarFooter>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton>
          <User2 /> Username
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
</Sidebar>
```

## SidebarContent {#sidebarcontent}

`SidebarContent` 组件用于包裹侧边栏内容。请在此处添加 `SidebarGroup` 组件。这一区域可以滚动。

```tsx:line-numbers
<Sidebar>
  <SidebarContent>
    <SidebarGroup />
    <SidebarGroup />
  </SidebarContent>
</Sidebar>
```

## SidebarGroup {#sidebargroup}

使用 `SidebarGroup` 组件在侧边栏内创建分区。

`SidebarGroup` 包含 `SidebarGroupLabel`、`SidebarGroupContent` 和可选的 `SidebarGroupAction`。

```tsx:line-numbers
<SidebarGroup>
  <SidebarGroupLabel>Application</SidebarGroupLabel>
  <SidebarGroupAction>
    <Plus /> <span className="sr-only">Add Project</span>
  </SidebarGroupAction>
  <SidebarGroupContent></SidebarGroupContent>
</SidebarGroup>
```

要让 `SidebarGroup` 可折叠，请用 `Collapsible` 将其包裹。

```tsx:line-numbers
<Collapsible defaultOpen className="group/collapsible">
  <SidebarGroup>
    <SidebarGroupLabel render={<CollapsibleTrigger />}>
      Help
      <ChevronDown className="ml-auto transition-transform group-data-open/collapsible:rotate-180" />
    </SidebarGroupLabel>
    <CollapsibleContent>
      <SidebarGroupContent />
    </CollapsibleContent>
  </SidebarGroup>
</Collapsible>
```

## SidebarMenu {#sidebarmenu}

`SidebarMenu` 组件用于在 `SidebarGroup` 内构建菜单。

<img src="https://ui.shadcn.com/images/sidebar-menu.png" alt="侧边栏菜单" class="mt-6 w-full overflow-hidden rounded-2xl border dark:hidden">
<img src="https://ui.shadcn.com/images/sidebar-menu-dark.png" alt="侧边栏菜单" class="mt-6 hidden w-full overflow-hidden rounded-2xl border dark:block">

```tsx:line-numbers
<SidebarMenu>
  {projects.map((project) => (
    <SidebarMenuItem key={project.name}>
      <SidebarMenuButton render={<a href={project.url} />}>
        <project.icon />
        <span>{project.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))}
</SidebarMenu>
```

## SidebarMenuButton {#sidebarmenubutton}

`SidebarMenuButton` 组件用于在 `SidebarMenuItem` 内渲染菜单按钮。

`SidebarMenuButton` 默认渲染按钮。你可以使用 `render` 属性渲染其他组件，例如 `Link` 或 `a` 标签。

使用 `isActive` 属性将菜单项标记为激活。

```tsx:line-numbers
<SidebarMenuButton render={<a href="#" />} isActive>
  Home
</SidebarMenuButton>
```

## SidebarMenuAction {#sidebarmenuaction}

`SidebarMenuAction` 组件用于在 `SidebarMenuItem` 内渲染菜单操作。

```tsx:line-numbers
<SidebarMenuItem>
  <SidebarMenuButton render={<a href="#" />}>
    <Home />
    <span>Home</span>
  </SidebarMenuButton>
  <SidebarMenuAction>
    <Plus /> <span className="sr-only">Add Project</span>
  </SidebarMenuAction>
</SidebarMenuItem>
```

## SidebarMenuSub {#sidebarmenusub}

`SidebarMenuSub` 组件用于在 `SidebarMenu` 内渲染子菜单。

```tsx:line-numbers
<SidebarMenuItem>
  <SidebarMenuButton />
  <SidebarMenuSub>
    <SidebarMenuSubItem>
      <SidebarMenuSubButton />
    </SidebarMenuSubItem>
  </SidebarMenuSub>
</SidebarMenuItem>
```

## SidebarMenuBadge {#sidebarmenubadge}

`SidebarMenuBadge` 组件用于在 `SidebarMenuItem` 内渲染徽章。

```tsx:line-numbers
<SidebarMenuItem>
  <SidebarMenuButton />
  <SidebarMenuBadge>24</SidebarMenuBadge>
</SidebarMenuItem>
```

## SidebarMenuSkeleton {#sidebarmenuskeleton}

`SidebarMenuSkeleton` 组件用于渲染 `SidebarMenu` 的骨架屏。

```tsx:line-numbers
<SidebarMenu>
  {Array.from({ length: 5 }).map((_, index) => (
    <SidebarMenuItem key={index}>
      <SidebarMenuSkeleton />
    </SidebarMenuItem>
  ))}
</SidebarMenu>
```

## SidebarTrigger {#sidebartrigger}

使用 `SidebarTrigger` 组件渲染用于切换侧边栏的按钮。

```tsx:line-numbers
import { useSidebar } from "@/components/ui/sidebar"

export function CustomTrigger() {
  const { toggleSidebar } = useSidebar()

  return <button onClick={toggleSidebar}>Toggle Sidebar</button>
}
```

## SidebarRail {#sidebarrail}

`SidebarRail` 组件用于在 `Sidebar` 内渲染侧边轨道。可以使用这条轨道来切换侧边栏。

```tsx:line-numbers
<Sidebar>
  <SidebarHeader />
  <SidebarContent>
    <SidebarGroup />
  </SidebarContent>
  <SidebarFooter />
  <SidebarRail />
</Sidebar>
```

## 受控侧边栏 {#controlled-sidebar}

使用 `open` 和 `onOpenChange` 属性控制侧边栏。

```tsx:line-numbers
export function AppSidebar() {
  const [open, setOpen] = React.useState(false)

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Sidebar />
    </SidebarProvider>
  )
}
```

## 主题 {#theming}

通过以下 CSS 变量设置侧边栏主题。

```css
:root {
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.439 0 0);
}
```

## 样式 {#styling}

下面演示如何根据侧边栏的不同状态设置样式。

```tsx
<Sidebar collapsible="icon">
  <SidebarContent>
    <SidebarGroup className="group-data-[collapsible=icon]:hidden" />
  </SidebarContent>
</Sidebar>
```

```tsx
<SidebarMenuItem>
  <SidebarMenuButton />
  <SidebarMenuAction className="peer-data-[active=true]/menu-button:opacity-100" />
</SidebarMenuItem>
```

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

  <a href="https://ui.shadcn.com/view/base-nova/sidebar-rtl" target="_blank">查看 RTL 侧边栏 </a>

## 更新日志 {#changelog}

### RTL 支持 {#rtl-support}

如果从旧版 `Sidebar` 组件升级，需要应用以下更新以添加 RTL 支持：

**1. 为 Sidebar 组件添加 `dir` 属性。**

在解构的属性中加入 `dir`，并在移动端将其传给 `SheetContent`：

```diff
  function Sidebar({
    side = "left",
    variant = "sidebar",
    collapsible = "offcanvas",
    className,
    children,
+   dir,
    ...props
  }: React.ComponentProps<"div"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }) {
```

然后在移动端视图中将其传给 `SheetContent`：

```diff
  <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
    <SheetContent
+     dir={dir}
      data-sidebar="sidebar"
      data-slot="sidebar"
      data-mobile="true"
```

**2. 为侧边栏容器添加 `data-side` 属性。**

为侧边栏容器元素添加 `data-side={side}`：

```diff
  <div
    data-slot="sidebar-container"
+   data-side={side}
    className={cn(
```

**3. 更新侧边栏容器的定位类。**

将 JavaScript 三元条件控制的类替换为 CSS 数据属性选择器：

```diff
  className={cn(
-   "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
-   side === "left"
-     ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
-     : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
+   "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex data-[side=left]:left-0 data-[side=right]:right-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
```

**4. 更新 SidebarRail 的定位类。**

更新 `SidebarRail` 组件，使轨道使用物理方向定位：

```diff
  className={cn(
-   "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-end-4 group-data-[side=right]:start-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex",
+   "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 ltr:-translate-x-1/2 rtl:-translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex",
```

**5. 为 SidebarTrigger 图标添加 RTL 翻转。**

为 `SidebarTrigger` 中的图标添加 `className="rtl:rotate-180"`，使其在 RTL 模式下翻转：

```diff
  <Button ...>
-   <PanelLeftIcon />
+   <PanelLeftIcon className="rtl:rotate-180" />
    <span className="sr-only">Toggle Sidebar</span>
  </Button>
```

应用这些更改后，可以使用 `dir` 属性设置方向：

```tsx
<Sidebar dir="rtl" side="right">
  {/* ... */}
</Sidebar>
```

侧边栏会在 LTR 和 RTL 布局中正确定位并处理交互。
