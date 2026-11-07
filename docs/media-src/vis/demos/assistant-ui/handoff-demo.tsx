"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { AgentHandoff } from "../../assistant-ui/elements/agent-handoff";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const CARRIED = [
  "失败的测试及其输出",
  "已定位的两个文件",
];

const PHASES = [1800, 0] as const;

export function AgentHandoffDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <AgentHandoff
      from="问题排查代理"
      to="维护代理"
      reason="排查代理复现了问题，并将范围缩小到转换器。接下来由维护代理编写并验证补丁。"
      carried={CARRIED}
      settled={phase >= 1}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <AgentHandoffDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
