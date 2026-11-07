"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import {
  VoiceConversation,
  type VoiceMode,
  type VoiceTurn,
} from "../../assistant-ui/elements/voice-conversation";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const MODES: readonly VoiceMode[] = [
  "connecting",
  "listening",
  "thinking",
  "speaking",
  "listening",
];

const TRANSCRIPT: readonly VoiceTurn[] = [
  { id: "u1", role: "user", text: "上次部署出了什么问题？" },
  {
    id: "a1",
    role: "assistant",
    text: "转换器丢弃了空内容片段，我已经添加了检查。",
  },
];

const PHASES = [1200, 2600, 1600, 3200, 0] as const;
const VISIBLE = [0, 0, 1, 1, 2] as const;

export function VoiceConversationDemo() {
  const { phase, running } = useStoryPhases(PHASES);
  const mode = MODES[Math.min(phase, MODES.length - 1)]!;
  const [amplitude, setAmplitude] = useState(0.2);
  const [muted, setMuted] = useState(false);
  const oscillating = running && (mode === "listening" || mode === "speaking");
  const [syncedOscillating, setSyncedOscillating] = useState(oscillating);
  const displayAmplitude = oscillating ? amplitude : 0.15;

  if (syncedOscillating !== oscillating) {
    setSyncedOscillating(oscillating);
    if (oscillating) setAmplitude(0.15);
  }

  useEffect(() => {
    if (!oscillating) return;
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setAmplitude(0.35 + Math.abs(Math.sin(tick * 0.7)) * 0.6);
    }, 110);
    return () => clearInterval(id);
  }, [oscillating]);

  return (
    <VoiceConversation
      mode={mode}
      amplitude={displayAmplitude}
      transcript={TRANSCRIPT.slice(0, VISIBLE[Math.min(phase, 4)])}
      muted={muted}
      onToggleMute={() => setMuted((current) => !current)}
      onEnd={() => setMuted(false)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <VoiceConversationDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
