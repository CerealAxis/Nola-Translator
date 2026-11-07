"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { TaskCard } from "../../assistant-ui/elements/task-card";
import {
  formatSeconds,
  useElapsed,
  useStoryPhases,
} from "../../assistant-ui/use-demo";

const PHASES = [4200, 3000] as const;

export function TaskCardDemo() {
  const [open, setOpen] = useState(false);
  const { phase, running } = useStoryPhases(PHASES);
  const done = phase === 1;
  const elapsed = useElapsed(running && !done);

  return (
    <TaskCard
      label="审阅运行时"
      meta="调研"
      state={done ? "done" : "working"}
      elapsed={formatSeconds(elapsed)}
      result={done ? "找到了相关运行时入口。" : undefined}
      open={open}
      onOpenChange={setOpen}
    >
      <p>已查看运行时入口。</p>
      <p>已检查会话生命周期。</p>
      <p>已整理检查结果。</p>
    </TaskCard>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <TaskCardDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
