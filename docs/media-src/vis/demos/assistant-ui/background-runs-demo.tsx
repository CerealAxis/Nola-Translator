"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  BackgroundInbox,
  type BackgroundRun,
} from "../../assistant-ui/elements/background-inbox";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const RUNS: readonly BackgroundRun[] = [
  {
    id: "1",
    title: "检查各适配器的功能差异",
    state: "ready",
    elapsed: "4m",
    summary: "找到 6 处差异",
  },
  {
    id: "2",
    title: "重新生成 API 参考文档",
    state: "running",
    elapsed: "1m",
  },
  {
    id: "3",
    title: "更新依赖",
    state: "failed",
    elapsed: "2m",
    summary: "锁文件冲突",
  },
];

const PHASES = [2200, 0] as const;

export function BackgroundInboxDemo() {
  const { phase } = useStoryPhases(PHASES);

  const runs =
    phase === 0
      ? RUNS
      : RUNS.map((run) =>
          run.state === "running"
            ? {
                ...run,
                state: "ready" as const,
                elapsed: "3m",
                summary: "已写入 142 页",
              }
            : run,
        );

  return <BackgroundInbox runs={runs} onCollect={() => undefined} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <BackgroundInboxDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
