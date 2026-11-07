---
title: Read aloud（朗读）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Read aloud（朗读）

朗读一条消息，同步显示播放进度、当前词和倍速。

<demo react="assistant-ui/read-aloud-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-read-aloud"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-read-aloud.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 配置朗读适配器

为运行时配置语音朗读适配器。

```tsx
"use client";

import { WebSpeechSynthesisAdapter } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";

const runtime = useChatRuntime({
  adapters: { speech: new WebSpeechSynthesisAdapter() },
});
```

### 从消息开始或停止朗读

通过消息的语音动作开始与停止，读取播放状态更新控件。

```tsx
import { useAui, useAuiState } from "@assistant-ui/react";
import { ReadAloud } from "@/components/assistant-ui/elements/read-aloud";

function Playback() {
  const aui = useAui();
  const speech = useAuiState((s) => s.message.speech);
  const playing = speech?.status.type === "running" || speech?.status.type === "starting";

  return (
    <ReadAloud
      words={[]}
      spokenIndex={0}
      playing={playing}
      rate={1}
      elapsed="0:00"
      duration="0:00"
      onToggle={() => (playing ? aui.message.stopSpeaking() : aui.message.speak())}
    />
  );
}
```

**独立使用**

### 使用语音实例驱动

独立版由应用负责语音合成，并提供正文与播放状态。

```tsx
"use client";

import { useState } from "react";
import { ReadAloud } from "@/components/assistant-ui/elements/read-aloud";

const words = "巴黎是法国的首都。".split(" ");

export function Playback() {
  const [spokenIndex, setSpokenIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  return (
    <ReadAloud
      words={words}
      spokenIndex={spokenIndex}
      playing={playing}
      rate={rate}
      elapsed="0:02"
      duration="0:05"
      onToggle={() => setPlaying((p) => !p)}
      onRateChange={() => setRate((r) => (r >= 2 ? 1 : r + 0.25))}
    />
  );
}
```

### 推进播放词索引

收到播放位置或词边界事件时更新 `wordIndex`。

## 结构 {#anatomy}

正文随播放位置高亮，控制区显示播放状态和语速。

```tsx
<div data-slot="read-aloud">
  <p>{/* 区分当前选中项 */}</p>
  <div>
    <button aria-label="播放" />
    <span role="progressbar">{/* 显示进度 */}</span>
    <span>{/* 显示时间或耗时 */}</span>
    <button>{/* 对应槽位内容 */}</button>
  </div>
</div>
```

进度条和当前词使用同一个 `spokenIndex`。之前的词淡出，当前词突出显示，之后的词保留普通颜色。辅助技术可读取与显示一致的时间和进度。

## 示例 {#examples}

### 语速控制

连接倍速回调，更新实际语音实例的 rate，再回传当前倍速。

```tsx
<ReadAloud
  words={words}
  spokenIndex={2}
  playing
  rate={1.5}
  elapsed="0:03"
  duration="0:08"
  onRateChange={() => cycleRate()}
/>
```

### 播放开始前

初始没有可高亮的词，收到第一个词的播放事件再更新索引。

## API 参考 {#api-reference}

**使用运行时**

### 消息方法与状态

| 成员 | 类型 | 说明 |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `aui.message.speak()` | `() => void` | 开始朗读当前消息。 |
| `aui.message.stopSpeaking()` | `() => void` | 停止朗读当前消息。 |
| `s.message.speech` | `{ messageId: string; status } \| undefined` | 消息语音朗读状态。 |

**独立使用**

### ReadAloud

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | ------------------- | -------- | ---------------------------------------------------------------------- |
| `words` | `readonly string[]` | 必填 | 要朗读的词数组，用于根据 spokenIndex 高亮当前词。 |
| `spokenIndex` | `number` | 必填 | 当前朗读词的索引。 |
| `playing` | `boolean` | 必填 | 是否正在播放。 |
| `rate` | `number` | 必填 | 当前播放倍速。 |
| `elapsed` | `string` | 必填 | 已播放时长。 |
| `duration` | `string` | 必填 | 总播放时长。 |
| `onToggle` | `() => void` |  | 在播放和暂停之间切换时调用。 |
| `onRateChange` | `() => void` |  | 选择播放倍速时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
