"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import {
  CostMeter,
  type CostLine,
} from "../../assistant-ui/elements/cost-meter";

const LINES: readonly CostLine[] = [
  {
    model: "Opus 5",
    inputTokens: 48_200,
    outputTokens: 12_400,
    cost: "$1.66",
    share: 0.62,
  },
  {
    model: "Sonnet 5",
    inputTokens: 92_800,
    outputTokens: 21_100,
    cost: "$0.86",
    share: 0.29,
  },
  {
    model: "Haiku 4.5",
    inputTokens: 140_000,
    outputTokens: 8_900,
    cost: "$0.24",
    share: 0.09,
  },
];

export function CostMeterDemo() {
  return <CostMeter runCost="$2.76" sessionCost="$18.40" lines={LINES} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <CostMeterDemo />
      </div>
    </AssistantPreview>
  );
}
