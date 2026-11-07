"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  ReasoningEffort,
  type EffortLevel,
} from "../../assistant-ui/elements/reasoning-effort";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const LEVELS: readonly EffortLevel[] = [
  { key: "low", label: "低", budget: 2_000 },
  { key: "medium", label: "中", budget: 8_000 },
  { key: "high", label: "高", budget: 24_000 },
  { key: "max", label: "最大", budget: 64_000 },
];

const PHASES = [900, 900, 900, 900, 0] as const;
const SPENT = [0.14, 0.29, 0.41, 0.52, 0.58] as const;

export function ReasoningEffortDemo() {
  const { phase } = useStoryPhases(PHASES);
  const [selectedKey, setSelectedKey] = useState("high");
  const level = LEVELS.find((item) => item.key === selectedKey);
  const budget = level?.budget ?? 0;
  const ratio = SPENT[Math.min(phase, SPENT.length - 1)] ?? 0;

  return (
    <ReasoningEffort
      levels={LEVELS}
      selectedKey={selectedKey}
      spent={Math.round(budget * ratio)}
      onSelect={setSelectedKey}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ReasoningEffortDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
