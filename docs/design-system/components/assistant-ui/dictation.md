---
title: Dictation（语音输入）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Dictation（语音输入）

在编辑器中启动语音听写，显示波形和识别结果。

<demo react="assistant-ui/dictation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-composer"
```

</template>

<template #manual>

- [组件注册表](https://r.assistant-ui.com/styles/new-york/elements-composer.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 配置听写适配器

向运行时提供 dictation adapter，例如 `WebSpeechDictationAdapter`。

```tsx
import { useLocalRuntime, WebSpeechDictationAdapter } from "@assistant-ui/react";

const runtime = useLocalRuntime(chatModel, {
  adapters: {
    dictation: WebSpeechDictationAdapter.isSupported()
      ? new WebSpeechDictationAdapter({ interimResults: true })
      : undefined,
  },
});
```

### 开始、显示与停止

用 `ComposerPrimitive` 的听写动作启动、显示和停止，根据支持能力决定是否提供入口。

```tsx
"use client";

import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { MicIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, inkButton } from "@/components/assistant-ui/elements/surfaces";

export function DictationControl() {
  return (
    <AuiIf condition={(s) => s.thread.capabilities.dictation}>
      <AuiIf condition={(s) => s.composer.dictation == null}>
        <ComposerPrimitive.Dictate aria-label="开始语音输入" className={cn(ghostButton, "size-8")}>
          <MicIcon className="size-4" />
        </ComposerPrimitive.Dictate>
      </AuiIf>
      <AuiIf condition={(s) => s.composer.dictation != null}>
        <ComposerPrimitive.StopDictation
          aria-label="停止语音输入"
          className={cn(inkButton, "flex size-8 items-center justify-center rounded-full")}
        >
          <SquareIcon className="size-3 fill-current" />
        </ComposerPrimitive.StopDictation>
      </AuiIf>
    </AuiIf>
  );
}
```

**独立使用**

### 保存录音状态

独立版记录录音状态、音量及转写文本，并连接开始和结束。

```tsx
"use client";

import { useEffect, useState } from "react";
import { ComposerVoice, ComposerVoiceButton, ComposerInput } from "@/components/assistant-ui/elements/composer";

export function VoiceInput() {
  const [active, setActive] = useState(false); // from the first tap until the final transcript lands
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    setActive(true);
    setRecording(true);
    startBrowserRecognition({
      onFinal: (text) => {
        setRecording(false); // waveform settles into "正在转写"
        commitTranscript(text).finally(() => setActive(false));
      },
    });
  };

  return active ? (
    <div className="flex items-center gap-2">
      <ComposerVoice recording={recording} seconds={seconds} className="flex-1" />
      <ComposerVoiceButton active={recording} onClick={stopBrowserRecognition} />
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <ComposerInput className="flex-1" />
      <ComposerVoiceButton active={false} onClick={start} />
    </div>
  );
}
```

### 在输入与波形间切换

录音时显示 `ComposerVoice` 波形，停止后恢复文本输入。

## 结构 {#anatomy}

麦克风按钮触发录音，录音区域展示波形和实时文字。识别后的文本进入编辑器草稿。

```tsx
<div data-slot="composer-voice" data-recording={/* 在对应状态下为 true */}>
  {/* 对应槽位内容 */}
  <div>{/* 显示对应条目 */}</div>
  {/* 显示时间或耗时 */}
</div>
```

`ComposerVoice` 表示录音中或正在收尾。待机时使用普通编辑器。波形会随录音时间持续变化。

## 示例 {#examples}

### 检测设备是否支持

根据适配器能力决定是否显示麦克风。

**使用运行时**

```tsx
const dictationAvailable = WebSpeechDictationAdapter.isSupported();
```

### 叠加实时转写

把识别中的文字叠在输入区域，保留草稿的编辑逻辑。

**使用运行时**

```tsx
<ComposerPrimitive.DictationTranscript className="text-muted-foreground absolute inset-x-3 bottom-full text-sm" />
```

### 调整波形样式

给 `ComposerVoice` 传 `className`。

```tsx
<ComposerVoice recording={recording} seconds={seconds} className="gap-4" />
```

## API 参考 {#api-reference}

**使用运行时**

### ComposerPrimitive

| 组成部分 | Renders | 说明 |
| --------------------- | -------- | ----------------------------------------------------------------------------- |
| `Dictate` | `button` | 开始语音听写。 |
| `StopDictation` | `button` | 结束语音听写。 |
| `DictationTranscript` | `span` | 显示实时识别文字。 |

### WebSpeechDictationAdapter

| 选项 | 类型 | 默认值 | 说明 |
| ---------------- | --------- | -------------------- | ---------------------------------------------------------------------- |
| `language` | `string` | `navigator.language` | 语音识别使用的语言。 |
| `continuous` | `boolean` | `true` | 是否持续识别。 |
| `interimResults` | `boolean` | `true` | 是否接收中间转写结果。 |

`WebSpeechDictationAdapter.isSupported()` 是静态方法。在不提供 `SpeechRecognition` 的环境中使用适配器会报错。聆听时状态为 `starting` 或 `running`，结束后为 `ended`，原因是 `stopped`、`cancelled` 或 `error`。录音时长由调用方另行计时。

### 编辑器状态

| 选择器 | 类型 | 说明 |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `s.composer.dictation` | `{ status; transcript?: string; inputDisabled?: boolean } \| undefined` | 编辑器的当前听写状态。 |
| `s.thread.capabilities.dictation` | `boolean` | 当前会话是否支持听写。 |
| `aui.composer.startDictation()` | `() => void` | 开始听写。 |
| `aui.composer.stopDictation()` | `() => void` | 结束听写。 |

**独立使用**

### ComposerVoice

| 属性 | 类型 | 默认值 | 说明 |
| ----------- | --------- | -------- | --------------------------------------------------------------------------------- |
| `recording` | `boolean` | 必填 | 是否在录音。 |
| `seconds` | `number` | 必填 | 录音时长，单位为秒。 |
| `className` | `string` |  | 合并到根元素的类名。 |

### ComposerVoiceButton

| 属性 | 类型 | 默认值 | 说明 |
| -------- | --------- | -------- | -------------------------------------------------------------------------------- |
| `active` | `boolean` | 必填 | 是否为当前活动项。 |
