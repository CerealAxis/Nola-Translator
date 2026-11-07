---
title: Directive text（指令文本）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Directive text（指令文本）

将消息里的提及和命令指令渲染成行内标签。

<demo react="assistant-ui/directive-text-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/directive-text"
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
npx shadcn@latest add "@assistant-ui/elements-directive-text"
```

## 快速开始 {#getting-started}

选择运行时预设，或用自己的指令格式生成渲染组件。

### 注册渲染器 {#register-the-renderer}

在 `MessagePrimitive.Parts` 中将 `DirectiveText` 注册为文本片段渲染器。

```tsx
import { DirectiveText } from "@/components/assistant-ui/elements/directive-text.aui";
import { MessagePrimitive } from "@assistant-ui/react";

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
    </MessagePrimitive.Root>
  );
}
```

### 从自定义格式生成组件 {#build-a-component-from-your-own-format}

通过 `createDirectiveText` 传入格式器，使读取格式与输入区插入格式一致。

```tsx
import {
  createDirectiveText,
  type DirectiveTextFormatter,
  type DirectiveTextSegment,
} from "@/components/assistant-ui/elements/directive-text";

const bracketFormatter: DirectiveTextFormatter = {
  parse(text) {
    const segments: DirectiveTextSegment[] = [];
    const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) segments.push({ kind: "text" as const, text: text.slice(last, m.index) });
      segments.push({ kind: "mention" as const, type: "user", label: m[1]!, id: m[2]! });
      last = m.index + m[0].length;
    }
    if (last < text.length) segments.push({ kind: "text" as const, text: text.slice(last) });
    return segments;
  },
};

const MentionText = createDirectiveText(bracketFormatter);

export function Message({ text }: { text: string }) {
  return <MentionText text={text} />;
}
```

## 结构 {#anatomy}

普通文本按顺序渲染，指令片段替换为带可读标签的行内元素。

```tsx
<>
  <span>{textBetweenDirectives}</span>
  <span data-slot="directive-text-chip" data-directive-type={type} data-directive-id={id} aria-label={`${type}: ${label}`}>
    <Icon />
    {label}
  </span>
  {/* repeated per segment, in order */}
</>
```

## 示例 {#examples}

使用默认指令格式，并可为不同类型映射图标。

### assistant-ui 的默认指令格式 {#assistant-uis-default-directive-format}

文本由默认格式器解析出指令类型、标识符与标签。

```tsx
"请使用 :tool[搜索]{name=web-search} 查询这条信息。"
// → "Ask ", a chip labeled "Search" (type "tool", id "web-search"), " to look this up."
```

### 把指令类型映射到图标 {#map-directive-types-to-icons}

为提及、工具或命令配置图标，保留指令原有标签。

```tsx
import { WrenchIcon, SlashIcon, SparklesIcon } from "lucide-react";

createDirectiveText(defaultDirectiveFormatter, {
  iconMap: { tool: WrenchIcon, command: SlashIcon },
  fallbackIcon: SparklesIcon,
});
```

## API 参考 {#api-reference}

运行时组件、片段结构与格式器可分别复用。

### DirectiveText {#directivetext}

从当前文本片段读取内容并渲染解析结果。

### 指令片段 {#directive-segment}

用片段类型区分普通文本与指令，指令包含类型、ID 和可读标签。

### createDirectiveText {#createdirectivetext}

用指定格式器构建文本组件，适用于应用自定义语法。

### DirectiveTextFormatter {#directivetextformatter}

定义如何从文本识别指令并还原片段。
