"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  AgentStatus,
  type StatusStep,
} from "../../assistant-ui/elements/agent-status";
import {
  formatSeconds,
  useElapsed,
  useStoryPhases,
} from "../../assistant-ui/use-demo";

const PHASES = [3200, 2400, 2600, 3000] as const;
const STEPS: StatusStep[] = [
  { state: "working", label: "正在重构编辑器" },
  { state: "waiting", label: "等待批准" },
  { state: "working", label: "正在运行测试" },
  { state: "done", label: "已完成，修改了 2 个文件" },
];

export function AgentStatusDemo() {
  const { phase, running } = useStoryPhases(PHASES);
  const step = STEPS[phase]!;
  const elapsed = useElapsed(running && step.state !== "done");

  return (
    <AgentStatus
      state={step.state}
      label={step.label}
      elapsed={formatSeconds(elapsed)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <AgentStatusDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
