---
title: Voice conversation（语音对话）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Voice conversation（语音对话）

展示语音通话的连接、聆听和发言状态，提供打断与结束操作。

<demo react="assistant-ui/voice-conversation-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

**运行时版**

```bash
npx shadcn@latest add "@assistant-ui/voice-conversation"
```

**独立版**

```bash
npx shadcn@latest add "@assistant-ui/elements-voice-conversation"
```

</template>

<template #manual>

- [运行时版](https://r.assistant-ui.com/styles/new-york/voice-conversation.json)
- [独立版](https://r.assistant-ui.com/styles/new-york/elements-voice-conversation.json)

按注册表中的 `files` 路径复制源码，安装列出的依赖，再根据项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**使用运行时**

### 渲染绑定运行时的通话界面

把绑定运行时的 `VoiceConversation` 放在已启用语音会话的运行时下。

```tsx
"use client";

import { AuiIf } from "@assistant-ui/react";
import { VoiceConversation } from "@/components/assistant-ui/elements/voice-conversation.aui";

function LiveCallScreen() {
  return (
    <AuiIf condition={(s) => s.thread.capabilities.voice}>
      <VoiceConversation />
    </AuiIf>
  );
}
```

### 组合自定义通话界面

需要自行组合时，通过语音 hooks 读取会话状态并调用相应方法。

```tsx
import {
  type VoiceSessionState,
  useVoiceControls,
  useVoiceState,
  useVoiceVolume,
} from "@assistant-ui/react";
import { VoiceConversation, type VoiceMode } from "./voice-conversation";
import { useVoiceTranscript } from "./voice-conversation.aui";

const toMode = (voice: VoiceSessionState): VoiceMode => {
  if (voice.status.type === "starting") return "connecting";
  return voice.mode;
};

function CustomVoiceConversation() {
  const voice = useVoiceState();
  const amplitude = useVoiceVolume();
  const { mute, unmute, disconnect } = useVoiceControls();
  const transcript = useVoiceTranscript();

  if (voice === undefined || voice.status.type === "ended") return null;

  return (
    <VoiceConversation
      mode={toMode(voice)}
      amplitude={amplitude}
      transcript={transcript.slice(-2)}
      muted={voice.isMuted}
      onToggleMute={voice.isMuted ? unmute : mute}
      onEnd={disconnect}
    />
  );
}
```

**独立使用**

### 用状态驱动通话

独立版由调用方管理模式、计时和通话动作。

```tsx
"use client";

import { useState } from "react";
import { VoiceConversation, type VoiceMode, type VoiceTurn } from "@/components/assistant-ui/elements/voice-conversation";

export function Call() {
  const [mode, setMode] = useState<VoiceMode>("connecting");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);

  return (
    <VoiceConversation
      mode={mode}
      amplitude={mode === "listening" ? 0.6 : 0}
      transcript={transcript}
      muted={muted}
      onToggleMute={() => setMuted((m) => !m)}
      onInterrupt={mode === "speaking" ? () => setMode("listening") : undefined}
      onEnd={() => setMode("connecting")}
    />
  );
}
```

### 仅在发言时允许打断

只有语音正在播放时才提供打断入口。

## 结构 {#anatomy}

主区域显示会话状态和音频反馈，操作区包含静音、打断或结束通话。

```tsx
<div data-slot="voice-conversation">
  <button aria-label="打断助手">{/* 对应槽位内容 */}</button>
  <div>{/* 对应槽位内容 */}</div>
  <div>{/* 对应槽位内容 */}</div>
  <div>
    <button aria-pressed={/* 对应槽位内容 */}>{/* 对应槽位内容 */}</button>
    <button aria-label="结束通话" />
  </div>
</div>
```

聆听或发言时，圆环会随 0 到 1 的音量幅度变化。连接中和思考中显示固定尺寸与脉动中心。静音提示优先于发言时的打断提示。

## 示例 {#examples}

### 各个模式

随会话从连接、聆听到发言更新 mode。

```tsx
<VoiceConversation mode="connecting" amplitude={0} transcript={[]} />
<VoiceConversation mode="listening" amplitude={0.4} transcript={[]} />
<VoiceConversation mode="thinking" amplitude={0} transcript={[]} />
<VoiceConversation mode="speaking" amplitude={0.7} transcript={[]} onInterrupt={() => {}} />
```

### 结束通话

将结束动作连到运行时或调用方的会话清理，再切换到结束状态。

**使用运行时**

```tsx
const { disconnect } = useVoiceControls();

<VoiceConversation onEnd={disconnect} /* ... */ />
```

## API 参考 {#api-reference}

**使用运行时**

### 绑定运行时的 VoiceConversation

| 输入 | 类型 | 说明 |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `className` prop | `string \| undefined` | 合并到根元素的类名。 |
| 语音会话 | `s.thread.voice` | 运行时提供的语音会话。 |
| 语音音量 | `useVoiceVolume()` | 用于声波反馈的实时音量。 |
| 转写 | `useVoiceTranscript()` | 通话的实时语音转写。 |

### 语音 Hooks

| Hook | 返回值 | 说明 |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useVoiceState()` | `VoiceSessionState \| undefined` | 读取语音会话的当前状态。 |
| `useVoiceVolume()` | `number` | 读取语音会话的音量。 |
| `useVoiceControls()` | `{ connect, disconnect, mute, unmute }` | 取得操作语音会话的动作。 |

### 语音会话状态

| 字段 | 类型 | 说明 |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `status.type` | `"starting" \| "running" \| "ended"` | 当前状态的类型，决定界面所显示的阶段。 |
| `mode` | `"listening" \| "speaking"` | 当前语音通话模式。 |
| `isMuted` | `boolean` | 语音会话是否已静音。 |
| `canSendText` | `boolean` | 是否允许在语音会话中发送文字。 |

**独立使用**

### VoiceConversation

| 属性 | 类型 | 默认值 | 说明 |
| -------------- | --------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `mode` | `"connecting" \| "listening" \| "thinking" \| "speaking"` | 必填 | 当前语音通话模式。 |
| `amplitude` | `number` | 必填 | 音量幅度。 |
| `transcript` | `readonly VoiceTurn[]` (`{ id, role, text }`) | 必填 | 语音转写。 |
| `muted` | `boolean` |  | 是否静音。 |
| `onToggleMute` | `() => void` |  | 切换静音时调用。 |
| `onInterrupt` | `() => void` |  | 打断代理发言时调用。 |
| `onEnd` | `() => void` |  | 结束通话时调用。 |
| `className` | `string` |  | 合并到根元素的类名。 |

其余 `div` 属性会转发给根元素。
