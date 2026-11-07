---
title: Trace（轨迹）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Trace（轨迹）

用于构建推理过程、工具调用、来源等内容的基础组件。

<demo react="shadcn-base/trace-demo.tsx" />

`Trace` 是一个由多行组成的列表。每行都有图标和标题，还可附带描述和状态。行可以展开以显示更多详情、链接到其他页面，或打开对话框或侧边面板。

每行的结构相同，因此用 `Trace` 构建的推理过程、工具调用、来源和计划具有一致的外观和交互。

使用 `Trace` 展示智能体执行的步骤，例如调用工具、运行子智能体或编辑文件。使用 [Message](https://ui.shadcn.com/docs/components/base/message) 展示它的回复，并用 [Marker](https://ui.shadcn.com/docs/components/base/marker) 展示各轮之间的注记和分隔线。

## 使用 Trace 构建的模式 {#built-with-trace}

以下模式均由 `Trace` 的各个部件组合而成。有关示例和代码，请参阅 [AI Elements](https://ui.shadcn.com/docs/ai-elements)。

| 模式 | 展示内容 |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| [思维链](https://ui.shadcn.com/docs/ai-elements/base/chain-of-thought) | 可展开查看背后步骤的摘要。 |
| [计划](https://ui.shadcn.com/docs/ai-elements/base/plan) | 智能体计划执行的步骤及其当前进度。 |
| [队列](https://ui.shadcn.com/docs/ai-elements/base/queue) | 智能体的待办清单，区分剩余事项和已完成事项。 |
| [推理](https://ui.shadcn.com/docs/ai-elements/base/reasoning) | 智能体实时输出的推理过程。 |
| [来源](https://ui.shadcn.com/docs/ai-elements/base/sources) | 智能体在回复中使用的链接。 |
| [堆栈追踪](https://ui.shadcn.com/docs/ai-elements/base/stack-trace) | 失败的工具调用及其堆栈帧。 |
| [子智能体](https://ui.shadcn.com/docs/ai-elements/base/subagent) | 一次子智能体运行及其工具调用和结果。 |
| [任务](https://ui.shadcn.com/docs/ai-elements/base/task) | 智能体正在执行的各个步骤。 |
| [终端](https://ui.shadcn.com/docs/ai-elements/base/terminal) | 智能体运行的命令及其实时输出。 |
| [测试结果](https://ui.shadcn.com/docs/ai-elements/base/test-results) | 智能体发起的一次测试运行及其测试套件和失败项。 |
| [工具](https://ui.shadcn.com/docs/ai-elements/base/tool) | 智能体发起的一次工具调用，从输入到输出。 |

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add trace
```

</template>

<template #manual>

**1. 安装所需的 shadcn/ui 依赖：**

```bash
npx shadcn@latest add collapsible
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/trace.tsx [components/ui/trace.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

使用 `TraceLine` 展示单个步骤：

```tsx:line-numbers
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
```

```tsx:line-numbers
<Trace>
  <TraceLine>
    <TraceIcon>
      <SearchIcon />
    </TraceIcon>
    <TraceTitle>Searched for minimumReleaseAge</TraceTitle>
  </TraceLine>
</Trace>
```

用 `TraceCollapsible` 包裹该行，即可在展开时显示更多详情：

```tsx:line-numbers
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
```

```tsx:line-numbers
<Trace>
  <TraceCollapsible>
    <TraceCollapsibleTrigger>
      <TraceLine>
        <TraceIcon>
          <TerminalIcon />
        </TraceIcon>
        <TraceTitle>Ran node --version</TraceTitle>
      </TraceLine>
    </TraceCollapsibleTrigger>
    <TraceCollapsibleContent>v24.18.0</TraceCollapsibleContent>
  </TraceCollapsible>
</Trace>
```

## 组件结构 {#composition}

使用以下结构构建一行轨迹：

```text
Trace
└── TraceLine
    ├── TraceIcon
    ├── TraceTitle
    ├── TraceDescription
    └── TraceIcon
```

用 `TraceCollapsible` 包裹该行，即可在展开时显示更多详情：

```text
Trace
└── TraceCollapsible
    ├── TraceCollapsibleTrigger
    │   └── TraceLine
    └── TraceCollapsibleContent
```

`TraceLine` 始终代表这一行本身。要给该行添加操作，请用对应的触发器包裹它。

## 功能 {#features}

- 用一行统一展示推理过程、工具调用、来源、计划和任务
- 行可展开、链接到其他页面，或打开对话框、侧边面板、抽屉或弹出层
- 支持 `running`、`error` 和 `pending` 状态，运行时显示流光效果
- 支持嵌套行，可以从摘要展开到各步骤，再从步骤展开到其输出
- 支持 AI SDK 的推理、工具和来源部件
- 通过包裹每行的触发器支持键盘和屏幕阅读器
- 各部件均可通过 `className` 属性自定义样式

## 轨迹行 {#trace-line}

对于无详情可展示的步骤，可单独使用 `TraceLine`。屏幕阅读器会将其读作普通文本。

<demo react="shadcn-base/trace-static.tsx" />

## 状态 {#status}

如果步骤正在运行、已失败或尚未开始，请在 `TraceLine` 上设置 `status`。

<demo react="shadcn-base/trace-status.tsx" />

| 状态 | 适用情况 |
| ----------- | ----------------------------------------------------------------------------- |
| 无 | 已完成的工作，如“已运行 pnpm install”。 |
| `"error"` | 失败的工作。在标题中直接说明，如“运行 pnpm lint 失败”。 |
| `"running"` | 正在进行的工作。在标题中说明当前动作，如“正在运行 pnpm build”。 |
| `"pending"` | 尚未开始的工作，例如计划步骤“运行 pnpm test”。 |

## 描述 {#description}

将差异统计、耗时或数量等补充文本放在 `TraceTitle` 后的 `TraceDescription` 中。描述文本不会截断。

<demo react="shadcn-base/trace-description.tsx" />

## 可折叠 {#collapsible}

用 `TraceCollapsible` 包裹该行，以便展开时显示更多详情。将 `TraceLine` 放在 `TraceCollapsibleTrigger` 中，将详情放在 `TraceCollapsibleContent` 中。

<demo react="shadcn-base/trace-collapsible.tsx" />

## 展开状态 {#open-state}

行默认折叠。在 `TraceCollapsible` 上使用 `defaultOpen` 可以默认展开，或用 `open` 搭配 `onOpenChange` 控制该行。

<demo react="shadcn-base/trace-open.tsx" />

要在内容实时输出时展开该行，并优先响应读者的点击，请传入 `open ?? running`。

```tsx:line-numbers
const [open, setOpen] = React.useState<boolean>()

<TraceCollapsible
  open={open ?? running}
  onOpenChange={setOpen}
>
  <TraceCollapsibleTrigger>
    <TraceLine status={running ? "running" : undefined}>…</TraceLine>
  </TraceCollapsibleTrigger>
  <TraceCollapsibleContent>{text}</TraceCollapsibleContent>
</TraceCollapsible>
```

## 链接 {#link}

用锚点元素包裹 `TraceLine`。如果链接会打开新标签页，请加上右上箭头图标，以及带 `sr-only` 的“在新标签页中打开”提示。

<demo react="shadcn-base/trace-link.tsx" />

```tsx:line-numbers
<a href="https://docs.astro.build" target="_blank" rel="noreferrer">
  <TraceLine>
    <TraceTitle>
      Install Astro
      <span className="sr-only"> (opens in a new tab)</span>
    </TraceTitle>
    <TraceIcon>
      <ArrowUpRightIcon />
    </TraceIcon>
  </TraceLine>
</a>
```

## 对话框 {#dialog}

用对话框的触发器包裹 `TraceLine`。对话框负责管理打开状态、Escape 键和焦点恢复。

<demo react="shadcn-base/trace-dialog.tsx" />

```tsx:line-numbers
<Dialog>
  <DialogTrigger>
    <TraceLine>
      <TraceTitle>Searched the web for cache keys</TraceTitle>
      <TraceIcon>
        <ChevronRightIcon />
      </TraceIcon>
    </TraceLine>
  </DialogTrigger>
  <DialogContent>…</DialogContent>
</Dialog>
```

## 侧边面板 {#sheet}

结构与对话框相同。Drawer 和 Popover 也采用同样的方式。

<demo react="shadcn-base/trace-sheet.tsx" />

## 分组 {#group}

将相邻的行放在同一个 `Trace` 中。它也会为包裹 `TraceLine` 的触发器或链接设置样式。

<demo react="shadcn-base/trace-group.tsx" />

## 来源 {#sources}

一条可折叠的行，详情是一个由链接行组成的 `Trace`。

<demo react="shadcn-base/trace-sources.tsx" />

有关更多示例，请参阅[来源](https://ui.shadcn.com/docs/ai-elements/base/sources)。

## 思维链 {#chain-of-thought}

思维链是一条内含多个步骤行的可折叠行。根据子项设置父行的状态和标题。

<demo react="shadcn-base/trace-steps.tsx" />

有关更多示例，请参阅[思维链](https://ui.shadcn.com/docs/ai-elements/base/chain-of-thought)和[任务](https://ui.shadcn.com/docs/ai-elements/base/task)。

## 提交 {#commit}

一次提交对应一条可折叠行，每个有变更的文件各占一行。在标题中说明变更类型，如新增、编辑或删除，并将行数放在描述中。每个文件都在[侧边面板](#sheet)中打开其差异。

<demo react="shadcn-base/trace-commit.tsx" />

## 完整一轮 {#whole-turn}

包含三个层级，即整轮、摘要和各行。步骤之间的文本放在两个 `Trace` 列表之间。

<demo react="shadcn-base/trace-turn.tsx" />

## 推理 {#reasoning}

渲染来自 AI SDK 的 `reasoning` 部件。在首段文本到达前，该行显示为 `TraceLine`。请参阅[展开状态](#open-state)。

<demo react="shadcn-base/trace-thinking.tsx" />

有关更多示例，请参阅[推理](https://ui.shadcn.com/docs/ai-elements/base/reasoning)。

## 工具 {#tool}

渲染来自 AI SDK 的工具部件。按[工具](https://ui.shadcn.com/docs/ai-elements/base/tool#states)中的方式映射工具部件。

<demo react="shadcn-base/trace-tool-calls.tsx" />

有关更多示例，请参阅[工具](https://ui.shadcn.com/docs/ai-elements/base/tool)。

## 无障碍 {#accessibility}

`Trace` 自身不添加任何角色。每行的语义由包裹它的元素提供。

- 单独使用的 `TraceLine` 是一个 `span`。屏幕阅读器会按文本朗读它，Tab 键也会跳过它。
- 使用 `TraceCollapsibleTrigger` 包裹后，它会成为带有 `aria-expanded` 的按钮。使用链接或对话框、侧边面板的触发器包裹后，它采用对应元素的键盘和焦点行为。
- 辅助技术会忽略 `TraceIcon`，因此 `TraceTitle` 是无障碍名称。请用一句话说明发生了什么，例如写“已编辑 trace.tsx”，以交代具体操作。
- 链接会打开新标签页时，使用 `sr-only` 向标题添加“在新标签页中打开”。
- 状态通过颜色和动效呈现，也应写入标题。运行时写“正在运行 pnpm build”，发生错误时写“运行 pnpm build 失败”。
- 当读者偏好减少动效时，运行中标题的流光效果会停止。标题仍会说明当前正在发生的事。
- 在 [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller) 中，每行在添加时都会播报一次。
- `TraceCollapsibleContent` 会弱化文本颜色。如果在其中放置了背景色较弱的区块，请给该区块设置 `text-foreground` 以保持对比度。`CodeBlock` 会设置自己的文本颜色。

## API 参考 {#api-reference}

### Trace {#trace}

由多行组成的列表。它也会为包裹 `TraceLine` 的触发器或链接设置样式。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | -------- | ------- | ---------------------------------------- |
| `className` | `string` | - | 应用于列表的附加类。 |

### TraceLine {#traceline}

一行包含一个图标和一个标题。它是 span 元素，没有按钮行为，也不会通过 Tab 键获得焦点。用触发器或链接包裹它即可添加操作。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | ----------------------------------- | ------- | ---------------------------------------- |
| `status` | `"running" \| "error" \| "pending"` | - | 该行所报告工作的状态。 |
| `className` | `string` | - | 应用于该行的附加类。 |

### TraceIcon {#traceicon}

装饰性图标插槽，辅助技术会忽略它。放在标题前时用于表示操作，放在标题后时用作指示器。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | -------- | ------- | --------------------------------------------- |
| `className` | `string` | - | 应用于图标插槽的附加类。 |

### TraceTitle {#tracetitle}

单行显示的一句话。内容过长时会截断，该行处于运行状态时会显示流光效果。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | - | 应用于标题的附加类。 |

### TraceDescription {#tracedescription}

标题后的补充文本，例如数量或耗时。描述文本不会截断。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | -------- | ------- | ----------------------------------------------- |
| `className` | `string` | - | 应用于描述的附加类。 |

### TraceCollapsible {#tracecollapsible}

可以展开的行。接受 [`Collapsible`](https://ui.shadcn.com/docs/components/base/collapsible) 的属性。

| 属性 | 类型 | 默认值 | 描述 |
| -------------- | ------------------------- | ------- | ------------------------------------------------------- |
| `open` | `boolean` | - | 受控的展开状态。与 `onOpenChange` 一起传入。 |
| `defaultOpen` | `boolean` | `false` | 该行是否默认展开。 |
| `onOpenChange` | `(open: boolean) => void` | - | 展开状态变化时调用。 |
| `className` | `string` | - | 应用于该行的附加类。 |

### TraceCollapsibleTrigger {#tracecollapsibletrigger}

用于展开和折叠该行的按钮。将 `TraceLine` 放入其中，即可在该行末尾显示箭头。

| 属性 | 类型 | 默认值 | 描述 |
| ----------- | -------- | ------- | ------------------------------------------- |
| `className` | `string` | - | 应用于触发器的附加类。 |

### TraceCollapsibleContent {#tracecollapsiblecontent}

可展开行的详情。

| 属性 | 类型 | 默认值 | 描述 |
| ------------- | --------- | ------- | --------------------------------------------------------------------------- |
| `keepMounted` | `boolean` | `false` | 折叠时保持详情挂载，使嵌套行保留各自的展开状态。 |
| `className` | `string` | - | 应用于内容的附加类。 |
