"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ContextBreakdown,
  type ContextSegment,
} from "../../assistant-ui/elements/context-breakdown";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const GROWTH = [0.45, 0.72, 1] as const;

const SEGMENTS: readonly ContextSegment[] = [
  { label: "系统提示词", tokens: 1_800, tint: "bg-chart-3" },
  { label: "工具", tokens: 4_200, tint: "bg-chart-4" },
  {
    label: "附件",
    tokens: 38_500,
    tint: "bg-chart-2",
  },
  {
    label: "对话",
    tokens: 68_400,
    tint: "bg-chart-1",
  },
];

const PHASES = [1200, 1200, 0] as const;

export function ContextBreakdownDemo() {
  const { phase } = useStoryPhases(PHASES);
  const scale = GROWTH[Math.min(phase, GROWTH.length - 1)]!;

  return (
    <ContextBreakdown
      segments={SEGMENTS.map((segment) => ({
        ...segment,
        tokens: Math.round(segment.tokens * scale),
      }))}
      limit={128_000}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ContextBreakdownDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
