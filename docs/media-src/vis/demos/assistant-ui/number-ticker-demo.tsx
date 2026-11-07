"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { NumberTicker } from "../../assistant-ui/elements/number-ticker";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const VALUES = [12847, 14211, 15108, 17318, 17776] as const;
const PHASES = [900, 900, 900, 900, 0] as const;

export function NumberTickerDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <NumberTicker value={VALUES[phase] ?? VALUES[0]} label="代币" />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><NumberTickerDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
