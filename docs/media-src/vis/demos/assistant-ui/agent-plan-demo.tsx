"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { AgentPlan } from "../../assistant-ui/elements/agent-plan";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const STEPS = [
  {
    id: "read",
    label: "检查现有编辑器状态",
    description: "修改前先梳理当前的数据流。",
  },
  {
    id: "design",
    label: "设计草稿存储",
    description: "未确认的更改暂存在本地。",
  },
  { id: "wire", label: "连接运行时持久化" },
  { id: "test", label: "添加回归测试" },
  { id: "docs", label: "更新文档" },
] as const;

const PHASES = [1900, 1900, 1900, 1900, 1900, 2400] as const;

export function AgentPlanDemo() {
  const { phase } = useStoryPhases(PHASES);

  return <AgentPlan title="编辑器草稿" steps={STEPS} activeIndex={phase} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <AgentPlanDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
