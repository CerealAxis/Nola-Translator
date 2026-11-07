"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { ToolCall } from "../../assistant-ui/elements/tool-call";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [2200, 1400, 3000, 0] as const;

export function ToolCallDemo() {
  const { phase, running, takeOver } = useStoryPhases(PHASES);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const open = running ? phase === 2 : (userOpen ?? false);

  return (
    <ToolCall
      label="搜索文档"
      activeLabel="正在搜索文档"
      query="草稿持久化"
      request={'{"query": "草稿持久化"}'}
      result="找到 3 条结果，最相关的是 /docs/runtime/drafts"
      running={running && phase === 0}
      open={open}
      onOpenChange={(next) => {
        takeOver();
        setUserOpen(next);
      }}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ToolCallDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
