---
title: Context display（上下文显示）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Context display（上下文显示）

用环形、条形或文本显示模型的上下文占用量，展开后可查看明细。

<demo react="assistant-ui/context-display-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/context-display"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

也可安装通过属性传值的独立组件。

```bash
npx shadcn@latest add "@assistant-ui/elements-context-display"
```

## 快速开始 {#getting-started}

组件可读运行时中的 token 用量，也支持直接接收用量数据。

### 从接口传递 token 用量 {#forward-token-usage-from-your-route-handler}

在流式接口结束时把模型报告的用量传给客户端，使运行时能区分输入、输出和其他 token。

```tsx
import { streamText, convertToModelMessages } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    abortSignal: req.signal,
    model: getModel(),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") return { usage: part.totalUsage };
      if (part.type === "finish-step")
        return { modelId: part.response.modelId };
      return undefined;
    },
  });
}
```

### 挂载预设 {#mount-a-preset}

在对话作用域放置 `ContextDisplay`，选择环形、条形或文字显示。

```tsx
import { ContextDisplay } from "@/components/assistant-ui/elements/context-display.aui";

function ThreadFooter() {
  return (
    <div className="flex items-center justify-end px-3 py-1.5">
      <ContextDisplay.Bar modelContextWindow={128000} />
    </div>
  );
}
```

### 通过属性传入用量 {#pass-usage-as-a-prop}

独立的 `ContextDisplayRing`、`ContextDisplayBar` 与 `ContextDisplayText` 可以直接接收用量，适合已有统计数据的界面。

```tsx
import { ContextDisplayBar } from "@/components/assistant-ui/elements/context-display";

export function UsageBadge() {
  return (
    <ContextDisplayBar
      modelContextWindow={128000}
      usage={{ totalTokens: 42000, inputTokens: 38000, outputTokens: 4000 }}
    />
  );
}
```

## 结构 {#anatomy}

`Root` 管理统计上下文；`Trigger` 呈现摘要；`Content` 提供展开后的用量明细。

```tsx
<button data-slot="context-display-trigger">
  {/* Ring: SVG donut + percent. Bar: fill bar + token count and percent. Text: "12k / 128k" */}
</button>
<div data-slot="context-display-popover">
  <div>{/* "33% full" */} <span>{/* used / total, monospaced */}</span></div>
  <div>{/* progress bar, min-width 4px once usage is nonzero */}</div>
  <div>Input           <span>{/* only when > 0 */}</span></div>
  <div>Cached input    <span>{/* only when > 0 */}</span></div>
  <div>Output          <span>{/* only when > 0 */}</span></div>
  <div>Reasoning       <span>{/* only when > 0 */}</span></div>
</div>
```

## 示例 {#examples}

使用预设，也可保留现成明细并替换触发区。

### 三种预设 {#three-presets}

环形占用面积小，条形直观展示比例，文字用于显示精确的数量或百分比。

```tsx
<ContextDisplay.Ring modelContextWindow={128000} />
<ContextDisplay.Bar modelContextWindow={128000} />
<ContextDisplay.Text modelContextWindow={128000} />
```

```tsx
<ContextDisplay.Ring modelContextWindow={128000} usage={usage} />
<ContextDisplay.Bar modelContextWindow={128000} usage={usage} />
<ContextDisplay.Text modelContextWindow={128000} usage={usage} />
```

### 组合自定义图形 {#compose-your-own-visual}

通过根节点共享用量信息，把自己的图形渲染到触发区。

```tsx
<ContextDisplay.Root modelContextWindow={128000}>
  <ContextDisplay.Trigger aria-label="上下文用量">
    <MyCustomGauge />
  </ContextDisplay.Trigger>
  <ContextDisplay.Content side="top" />
</ContextDisplay.Root>
```

### 调整触发区样式 {#restyle-the-trigger}

给触发区传入 `className`，沿用原有弹层交互并修改外观。

```tsx
<ContextDisplay.Bar className="px-1" side="bottom" modelContextWindow={128000} />
```

## API 参考 {#api-reference}

预设的图形各异，共享用量和明细相关属性。

### 预设属性（环形、条形、文本） {#preset-props-ring-bar-text}

按实际数据传入当前用量与最大上下文窗口，外部可设置类名和弹层方向。

### 可组合根节点 {#composable-root}

根节点向触发区和明细提供归一化后的用量数据。

### 对话状态 {#thread-state}

运行时版本读取对话中的最新用量；尚未收到数据时无法显示准确比例。

### Root {#root}

创建上下文显示范围。

### Trigger {#trigger}

呈现简短的占用指示，并打开明细。

### Content {#content}

显示分类用量、窗口上限和占比等数据。
