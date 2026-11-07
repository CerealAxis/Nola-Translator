"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  MemoryChips,
  type MemoryChip,
} from "../../assistant-ui/elements/memory-chips";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const CHIPS: readonly MemoryChip[] = [
  { id: "1", text: "更喜欢 TypeScript", change: "existing" },
  { id: "2", text: "在 pnpm monorepo 中工作", change: "existing" },
  { id: "3", text: "附带变更集", change: "added" },
  { id: "4", text: "合并前评论", change: "added" },
];

const PHASES = [1400, 900, 0] as const;

export function MemoryChipsDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <MemoryChips chips={CHIPS.slice(0, 2 + phase)} onForget={() => undefined} />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><MemoryChipsDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
