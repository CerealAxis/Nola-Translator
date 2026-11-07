"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { ArtifactCard } from "../../assistant-ui/elements/artifact-card";
import { useElapsed, useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [3200, 2800] as const;
const MAX_WORDS = 214;

export function ArtifactCardDemo() {
  const { phase } = useStoryPhases(PHASES);
  const generating = phase === 0;
  const tenths = useElapsed(generating);
  const words = Math.min(MAX_WORDS, Math.floor((tenths * MAX_WORDS) / 32));

  return (
    <ArtifactCard
      title="草稿持久化提案"
      meta="文档 · 第 3 版 · 刚刚"
      generating={generating}
      words={words}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ArtifactCardDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
