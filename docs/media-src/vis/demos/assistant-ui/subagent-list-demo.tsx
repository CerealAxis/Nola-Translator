"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  SubagentList,
  type SubagentItem,
} from "../../assistant-ui/elements/subagent-list";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const AGENTS: readonly SubagentItem[] = [
  { name: "检查运行时", model: "haiku" },
  { name: "修复编辑器类型", model: "sonnet" },
  { name: "编写回归测试", model: "sonnet" },
];

const SUMMARY_AGENT: SubagentItem = {
  name: "汇总检查结果",
  model: "haiku",
};
const PHASES = [1800, 1800, 2800] as const;
const PROGRESS = [
  [68, 44, 22],
  [100, 68, 44],
  [100, 100, 68],
] as const;

export function SubagentListDemo() {
  const { phase } = useStoryPhases(PHASES);
  const completedCount = phase === 0 ? 0 : phase === 1 ? 1 : 2;
  const progress =
    phase === 0 ? PROGRESS[0] : phase === 1 ? PROGRESS[1] : PROGRESS[2];

  return (
    <SubagentList
      agents={AGENTS}
      completedCount={completedCount}
      progress={progress}
      showSummary={phase === 2}
      summaryAgent={SUMMARY_AGENT}
      className="min-h-[14.5rem]"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <SubagentListDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
