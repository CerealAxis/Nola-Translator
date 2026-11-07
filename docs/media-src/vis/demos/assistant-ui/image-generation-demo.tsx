"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { ImageGeneration } from "../../assistant-ui/elements/image-generation";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [3600, 4000] as const;

export function ImageGenerationDemo() {
  const { phase, replay } = useStoryPhases(PHASES);
  return (
    <ImageGeneration
      prompt="黎明时平静的山湖"
      generating={phase === 0}
      onRegenerate={replay}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ImageGenerationDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
