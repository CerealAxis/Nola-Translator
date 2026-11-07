"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { LauncherBubble } from "../../assistant-ui/elements/launcher-bubble";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PROMPTS = [
  "如何添加会话列表？",
  "0.14 更新了什么？",
  "展示外部存储示例",
];

const PHASES = [1200, 0] as const;

export function LauncherBubbleDemo() {
  const { phase, takeOver } = useStoryPhases(PHASES);
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? phase >= 1;

  return (
    <LauncherBubble
      open={open}
      unread={2}
      greeting="需要 assistant-ui 的使用帮助吗？"
      prompts={PROMPTS}
      onPick={() => undefined}
      onStart={() => undefined}
      onToggle={() => {
        takeOver();
        setOverride(!open);
      }}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <LauncherBubbleDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
