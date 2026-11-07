---
title: Run activity（运行活动）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Run activity（运行活动）

实时汇总运行状态，按发生顺序展示说明和工具调用，并保留最终回答。

`RunActivity` 将一次运行的公共评论和工具合并到一个披露中。运行时，折叠视图显示最新的非空活动标签。完成后，同一行可以显示“Worked for 2m 13s”。决定和最终答案保留在折叠内容之外。

元素是一个 props 驱动的 React 注册表组件。它不执行工具、对模型输出进行分类或添加运行时。当你只需要工具步骤和文件统计信息的列表时，请使用[工具时间轴](./tool-timeline)。

<demo react="assistant-ui/run-activity-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-run-activity"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-run-activity.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

```tsx
import { useState } from "react";
import { RunActivity } from "@/components/assistant-ui/elements/run-activity";

function CompletedRun() {
  const [open, setOpen] = useState(false);
  return (
    <RunActivity
      status="complete"
      statusLabel="曾工作于"
      durationLabel="2m 13s"
      open={open}
      onOpenChange={setOpen}
      entries={[
        {
          id: "commentary-1",
          kind: "commentary",
          label: "检查文件",
          content: <p>我去检查一下文件。</p>,
        },
        {
          id: "read-1",
          kind: "tool",
          label: "Reading thread.tsx",
          content: <p>Read thread.tsx</p>,
        },
        {
          id: "commentary-2",
          kind: "commentary",
          label: "检查修复情况",
          content: <p>我发现了这个问题；检查修复。</p>,
        },
        {
          id: "test-1",
          kind: "tool",
          label: "运行测试",
          content: <p>所有测试均通过。</p>,
        },
      ]}
    >
      <p>修复已准备就绪。测试通过。</p>
    </RunActivity>
  );
}
```

仅将公共评论和工具历史记录按原始顺序放入 `entries` 中。提供稳定的 ID 和简短的活动标签。将明确标识的最终答案放入`children`中。该元素永远不会猜测文本部分是评论还是答案。空运行显示没有空披露按钮的状态。

## 具有外部存储运行时 {#with-an-external-store-runtime}

本页演示通过 `useExternalStoreRuntime`、`ThreadPrimitive.Viewport` 和 `MessagePrimitive.PartByIndex` 运行。其[完整、经过测试的集成](https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/demo/elements/run-activity.tsx)包括转换、计时、状态映射、工具批准和滚动锁定。

为每个应用程序定义的运行保留一个稳定的辅助消息 ID，并为记录中的每条消息提供其持久的 `createdAt`。没有消息的消息会被标记为当前时间，Next.js `cacheComponents` 在预渲染时不允许这样做。你的适配器必须在渲染之前识别运行边界并对每个部分进行分类。该示例仅在 `metadata.custom.activityPresentation` 中存储演示注释和计时。这是一个配方约定，而不是内置的 assistant-ui 元数据字段。内容、批准状态和消息状态是从实时运行时读取的，而不是复制到元数据中。

```tsx
const transcript: readonly ActivityMessage[] = [
  {
    id: "user-1",
    role: "user",
    content: "检查文件。",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  run,
];

const runtime = useExternalStoreRuntime<ActivityMessage>({
  messages: transcript,
  isRunning,
  convertMessage: convertActivityMessage,
  onNew: sendMessage,
  onRespondToToolApproval: respondToApproval,
  onAddToolResult: recordToolResult,
  onResumeToolCall: resumeToolCall,
});
```

`ActivityMessage` 是配方的 `ActivityRun | ThreadMessageLike` 联合。它的 `convertActivityMessage` 传递普通消息并仅注释显式运行。在应用程序中，`transcript` 来自状态：`onNew` 将用户轮次记录为正常消息，设置 `isRunning`，并在响应到达时更新相应的运行。上面的回调代表你的后端集成。该演示使用脚本化的单次运行。

将示例的 `ActivityRunMessage` 注册为辅助渲染器。它在安装运行披露之前检查 `activityPresentation`。普通的助手消息和运行时的乐观占位符将 `MessagePrimitive.Parts` 与现有的文本/工具渲染器一​​起使用。这会在后端提供第一次运行之前保留一个空的正在运行的脚本，并且新用户会变得安全。

运行转换涵盖文本和工具调用部分。它为每个文本部分分配其应用程序拥有的 `id` 并保留每个工具的 `toolCallId`。注释由部件类型和 ID 键入，因此运行时规范化可以删除空白文本，而无需更改其他部件的分类。提供在每个片段类型中唯一且在整个运行过程中稳定的非空 ID。

在消息渲染器中，阅读 `s.message.parts` 和 `s.message.status` 以及 `useAuiState` 旁边的注释。通过 `text:${part.id}` 或 `tool-call:${part.toolCallId}` 查找每个注释。使用 `MessagePrimitive.PartByIndex` 渲染每个分类部分，使用转换后消息中的索引和现有的文本/工具组件。将`commentary`和`tool`条目放入公开内容中，将`answer`部分放入`children`中，将`attention`部分放入`attention`中。未分类的部分不在披露范围内。不要同时渲染整个消息的 `MessagePrimitive.Parts`：这会重复内容。

该示例将向用户显示的审批请求、工具中断、工具错误和运行时 `requires-action` 或 `incomplete` 工具部件保留在 `attention` 中，即使它们的原始分类是 `tool`。这包括仅状态工具决策，没有批准或中断有效负载。政策批准的 `approval.isAutomatic` 工具会保留在历史记录中，除非它们遇到错误、完成不完整或需要进一步关注。一旦出现，条目在结算后将保留在该消息实例的可见槽中。保留其 `attention` 分类或批准/中断元数据以在重新加载后保留该位置。它使用现有的 `ToolFallback`，因此运行时的批准或工具结果回调仍然会收到响应。还在那里提供应用程序的澄清和恢复渲染器。仅分类并不能实现批准或重试：将适当的外部存储回调连接到后端并保留其结果。

对于相邻的活动组，更喜欢带有自定义 `groupBy` 和独立工具处理的 [`MessagePrimitive.GroupedParts`](https://www.assistant-ui.com/docs/guides/part-grouping)]。此配方使用 `PartByIndex`，因为单次运行披露必须包括可见决策两侧的活动：`GroupedParts` 合并相邻部分，因此未分组的决策将该序列拆分为单独的披露。仅 props 元素适用于任何运行时；此适配器示例专门涵盖具有显式分类的外部存储运行。

如果你的后端每次运行发出多条消息，请将它们投影到适配器中的一条稳定的辅助消息中，保留它们的部分顺序和明确的最终答案标记。不要从最后的文本部分、标点符号或工具结尾推断答案。在运行过程中保持稳定的片段 ID 和顺序。为新轮次启动新的运行/消息 ID。

## 生命周期和持续时间 {#lifecycle-and-persisted-time}

| 运行时消息状态 | 元件状态 | 标签示例 |
| -------------------------------- | ----------------- | ---------------- |
| `running` | `running` | 工作中 |
| `requires-action` | `requires-action` | 需要你的输入 |
| `complete` | `complete` | 曾工作于 |
| `incomplete`，原因`cancelled` | `cancelled` | 停止后 |
| `incomplete`，原因`error` | `error` | 失败后 |
| 其他 `incomplete` 原因 | `incomplete` | 不完整 |

所有标签均由应用程序提供用于本地化。当没有可用的持续时间时，请使用完整的标签，例如“已完成”。不得仅仅因为流停止而将中断、取消或失败的运行重新标记为成功完成。

保留运行的状态、分类、开始时间戳和固定持续时间或结束时间戳及其内容。一个正在运行的时钟可以从那个持续的开始导出经过的时间。完成的运行必须使用持久持续时间，而不是自安装以来的时间。如果你的适配器为 `metadata.timing.totalStreamTime` 提供所需的运行范围，请直接格式化该值。错过的时间应该保持缺席。

`durationLabel` 接受 React 节点，因此小型时钟组件可以更新而无需重新渲染脚本。该演示使用现有的 `useTaskElapsed` 实用程序和应用程序拥有的开始/结束对。它的脚本化时间戳展示了合约。它们不是实时模型的测量结果。运行时，只有 `statusLabel` 进入实时区域，因此时钟滴答声和流标记不会中断屏幕阅读器的公告。一旦运行结束，公告就会包括其记录的持续时间。

## 扩展、聚焦和滚动 {#expansion-focus-and-scrolling}

将 `open` 保留在消息渲染器中，最初为 `false`，由稳定运行/消息 ID 键入。默认情况下，这会保持运行紧凑，并在新活动和完成中保留显式扩展或折叠。当流结束时，不要强制 `open` 为 `false`：用户可能正在检查或聚焦历史记录中的控件。

在运行时视口内，在更改 `open` 之前调用 `useScrollLock`，如集成示例所示。该元素在其状态更改时不会调用 `scrollIntoView` 或移动焦点。它的披​​露使用了已安装的 Base UI 或 Radix 基础组件、本机键盘激活、可见的聚焦环和简化的运动样式。具有自定义虚拟化转录本的应用程序应应用其现有的滚动锚定围绕公开内容。
