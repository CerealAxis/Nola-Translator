"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { ThinkingIndicator } from "../../assistant-ui/elements/thinking-indicator";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const STATUSES = [
  "正在思考",
  "正在读取 thread.tsx",
  "正在搜索文档",
  "正在起草回复",
];

const PHASES = [2400, 2400, 2400, 0] as const;

export function ThinkingIndicatorDemo() {
  const { phase } = useStoryPhases(PHASES);

  return <ThinkingIndicator label={STATUSES[phase]!} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ThinkingIndicatorDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
