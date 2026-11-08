---
title: Orb（球形指示器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Orb（球形指示器）

实时语音圆球，展示连接、静音和说话状态。

<demo react="assistant-ui/orb-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/voice"
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
npx shadcn@latest add "@assistant-ui/elements-voice"
```

## 快速开始 {#getting-started}

组件可以从语音运行时读取状态，也可接收外部语音应用提供的状态。

### 配置语音适配器 {#configure-a-voice-adapter}

在 `useChatRuntime` 的适配器中配置语音会话实现。运行时据此启动和结束语音会话。

```tsx
import { useChatRuntime } from "@assistant-ui/ai-sdk";

const runtime = useChatRuntime({
  adapters: {
    voice: myVoiceAdapter,
  },
});
```

### 渲染圆球和控制条 {#render-the-orb-and-control-bar}

从 `voice.aui` 导入 `VoiceOrb` 与 `VoiceControl`。圆球读取会话状态和实时音量，控制条提供连接、切换静音和结束通话。使用 `s.thread.capabilities.voice` 判断当前运行时是否配置了语音。

```tsx
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import {
  VoiceControl,
  VoiceOrb,
} from "@/components/assistant-ui/elements/voice.aui";
import { AuiIf } from "@assistant-ui/react";

export default function Chat() {
  return (
    <div className="flex h-full flex-col">
      <AuiIf condition={(s) => s.thread.capabilities.voice}>
        <div className="flex items-center justify-center py-6">
          <VoiceOrb />
        </div>
        <VoiceControl />
      </AuiIf>
      <div className="min-h-0 flex-1">
        <Thread />
      </div>
    </div>
  );
}
```

### 独立渲染圆球 {#render-the-orb}

`VoiceOrb` 也可独立挂载。传入 `state` 控制当前动画，外部状态变化时再更新属性。

```tsx
"use client";

import { useState } from "react";
import {
  VoiceOrb,
  type VoiceOrbState,
} from "@/components/assistant-ui/elements/voice";

export function Call() {
  const [state, setState] = useState<VoiceOrbState>("idle");
  return <VoiceOrb state={state} volume={0} />;
}
```

### 接入实时音量 {#feed-it-a-live-audio-level}

把当前归一化音量传给 `volume`，可让圆球响应真实声音。音频来源由应用负责。

```tsx
<VoiceOrb state={state} volume={micLevel} />
```

## 结构 {#anatomy}

圆球呈现语音状态，控制条提供连接、静音和挂断。各部分可以独立使用。

```tsx
<canvas className="aui-voice-orb" data-state={/* idle | connecting | listening | speaking | muted */} />

<div className="aui-voice-control">
  <span /> {/* status dot, colored by state */}
  {/* no session, or an ended one: */}
  <button>Connect</button>
  {/* starting: */}
  <span>Connecting...</span>
  {/* running: */}
  <button aria-label="切换静音" />
  <button aria-label="Disconnect" />
</div>
```

## 示例 {#examples}

同一个圆球可以切换语音状态和颜色组合。

### 状态 {#states}

状态用来区分空闲、连接中、收听和说话等语音阶段。单独渲染时直接切换 `state`。

```tsx
{(["idle", "connecting", "listening", "speaking", "muted"] as const).map(
  (state) => (
    <VoiceOrb key={state} state={state} />
  ),
)}
```

```tsx
import { VoiceOrb } from "@/components/assistant-ui/elements/voice";

{(["idle", "connecting", "listening", "speaking", "muted"] as const).map(
  (state) => (
    <VoiceOrb key={state} state={state} />
  ),
)}
```

### 配色 {#palettes}

可为圆球传入自定义颜色，配合应用主题或不同说话角色。

```tsx
<VoiceOrb variant="violet" />
```

### 语音会话从哪里来 {#where-sessions-come-from}

运行时通过 voice adapter 获取会话实现。适配器负责与语音服务通信并报告会话状态。

```tsx
function ComposerVoiceToggle() {
  const voiceState = useVoiceState();
  const { connect, disconnect } = useVoiceControls();
  const isActive =
    voiceState?.status.type === "running" ||
    voiceState?.status.type === "starting";

  return (
    <AuiIf condition={(s) => s.thread.capabilities.voice}>
      <button
        type="button"
        onClick={() => (isActive ? disconnect() : connect())}
        aria-label={isActive ? "结束语音" : "启动语音"}
      >
        {isActive ? <PhoneOffIcon /> : <PhoneIcon />}
      </button>
    </AuiIf>
  );
}
```

```tsx
<VoiceOrb
  state={isMuted ? "muted" : isSpeaking ? "speaking" : "listening"}
  volume={micLevel}
/>
```

## API 参考 {#api-reference}

可选择订阅运行时的入口，或直接使用 `VoiceOrb`。

### 子组件 {#sub-components}

`VoiceOrb` 动画由会话状态和音量决定，可以用 `state` 覆盖状态。 `VoiceControl` 包含 `VoiceStatusDot`、`VoiceConnectButton`、`VoiceMuteButton` 和 `VoiceDisconnectButton`。自定义指示器可调用 `deriveVoiceOrbState(voiceState)`。

### 语音状态 {#voice-state}

`s.thread.voice` 在没有会话时为 `undefined`；状态阶段包括 `starting`、`running` 和 `ended`。结束时附带 `finished`、`cancelled` 或 `error`。 `isMuted` 表示麦克风是否静音，`mode` 区分 `listening` 与 `speaking`。 `useVoiceVolume()` 读取 0 到 1 的实时音量，`useVoiceControls()` 提供连接、断开、静音与取消静音。

### VoiceOrb {#voiceorb}

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `state` | `"idle" \| "connecting" \| "listening" \| "speaking" \| "muted"` | `"idle"` | 动画状态。 |
| `volume` | `number` | `0` | 0 到 1 的音量，影响速度、形变与亮度。 |
| `variant` | `"default" \| "blue" \| "violet" \| "emerald"` | `"default"` | 圆球配色。 |
| `className` | `string` | | 添加到画布元素。 |
