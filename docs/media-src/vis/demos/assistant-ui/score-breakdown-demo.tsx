"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ScoreBreakdown,
  type ScoreCriterion,
} from "../../assistant-ui/elements/score-breakdown";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const CRITERIA: readonly ScoreCriterion[] = [
  {
    label: "是否解决根因",
    score: 4.5,
    weight: 3,
    note: "从数据源清理槽位，无需在调用处绕过问题。",
  },
  { label: "测试覆盖", score: 4, weight: 2 },
  {
    label: "改动范围",
    score: 3,
    weight: 1,
    note: "包含一项无关的格式调整。",
  },
];

const PHASES = [600, 600, 0] as const;

export function ScoreBreakdownDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <ScoreBreakdown
      verdict="通过"
      total={4.1}
      outOf={5}
      criteria={CRITERIA}
      visibleCount={Math.min(phase + 1, CRITERIA.length)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ScoreBreakdownDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
