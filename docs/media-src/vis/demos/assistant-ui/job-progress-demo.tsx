"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  JobProgress,
  type JobStage,
} from "../../assistant-ui/elements/job-progress";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const STAGES: readonly JobStage[] = [
  { name: "获取代码", weight: 1, description: "正在获取分支" },
  { name: "安装依赖", weight: 4, description: "正在恢复依赖" },
  { name: "构建", weight: 3, description: "正在编译软件包" },
  { name: "测试", weight: 2, description: "正在执行测试" },
];

const PHASES = [1000, 1000, 1000, 1000, 0] as const;
const ETAS = ["约 4 分钟", "约 3 分钟", "约 1 分钟", "几秒"] as const;

export function JobProgressDemo() {
  const { phase, takeOver } = useStoryPhases(PHASES);
  const [cancelledAt, setCancelledAt] = useState<number | undefined>();
  const stageIndex = cancelledAt ?? phase;
  const finished = cancelledAt === undefined && phase === STAGES.length;

  return (
    <JobProgress
      title="在 CI 中验证修复"
      stages={STAGES}
      stageIndex={stageIndex}
      stageProgress={0.6}
      eta={ETAS[Math.min(stageIndex, ETAS.length - 1)] ?? "几秒"}
      onCancel={() => {
        takeOver();
        setCancelledAt(phase);
      }}
      outcome={
        cancelledAt !== undefined
          ? {
              status: "cancelled",
              summary: `已取消：${STAGES[cancelledAt]?.name ?? "本次运行"}。`,
            }
          : finished
            ? {
                status: "partial",
                summary:
                  "构建成功。预览超时后，测试已停止。",
              }
            : undefined
      }
      elapsedMs={finished ? 72_000 : undefined}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <JobProgressDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
