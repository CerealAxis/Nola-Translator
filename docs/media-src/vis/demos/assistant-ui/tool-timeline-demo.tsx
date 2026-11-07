"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  FileSearchIcon,
  PenLineIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import {
  ToolTimeline,
  type TimelineStat,
  type TimelineStep,
} from "../../assistant-ui/elements/tool-timeline";
import { useElapsed, useStoryPhases } from "../../assistant-ui/use-demo";

const STEPS: TimelineStep[] = [
  {
    verb: "正在思考",
    chip: "规划变革",
    icon: SparklesIcon,
  },
  {
    verb: "读",
    chip: "thread.tsx",
    icon: FileSearchIcon,
  },
  {
    verb: "冉",
    chip: "pnpm 维测试",
    icon: TerminalIcon,
  },
  {
    verb: "已编辑",
    chip: "composer.tsx",
    icon: PenLineIcon,
  },
];

const STATS: TimelineStat[] = [
  { file: "composer.tsx", added: 14, removed: 3 },
  { file: "use-draft.ts", added: 42 },
];

const PHASES = [1000, 1000, 1000, 1000, 2400, 0] as const;

export function ToolTimelineDemo() {
  const { phase, running, takeOver } = useStoryPhases(PHASES);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const streaming = running && phase < STEPS.length;
  const elapsed = useElapsed(streaming);
  const open = running ? phase !== PHASES.length - 1 : (userOpen ?? false);
  const visibleSteps = streaming ? phase + 1 : STEPS.length;

  return (
    <ToolTimeline
      steps={STEPS}
      visibleSteps={visibleSteps}
      streaming={streaming}
      open={open}
      onOpenChange={(next) => {
        takeOver();
        setUserOpen(next);
      }}
      restingLabel="4 steps · 2 files changed"
      activeLabel={`工作于 ${Math.floor(elapsed / 10)}s`}
      stats={STATS}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ToolTimelineDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
