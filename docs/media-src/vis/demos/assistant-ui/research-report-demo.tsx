"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ResearchReport,
  type ReportSection,
} from "../../assistant-ui/elements/research-report";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const HEADINGS = [
  "0.14 中发生了什么变化",
  "谁受到影响",
  "迁移路径",
  "开放问题",
] as const;

const PREVIEWS = [
  "草稿从父状态移至输入框拥有的每线程槽中。",
  "任何在自己的 useState 中镜像草稿的人都会读取一个永远不会更新的值。",
  "将镜像替换为useDraft(threadId)，并删除恢复物效果。",
] as const;

const PHASES = [1100, 1100, 1100, 0] as const;

export function ResearchReportDemo() {
  const { phase } = useStoryPhases(PHASES);

  const sections: ReportSection[] = HEADINGS.map((heading, i) => ({
    id: heading,
    heading,
    state: i < phase ? "done" : i === phase ? "writing" : "pending",
    sources: i < phase ? 4 - i : 0,
    ...(i < phase && PREVIEWS[i] ? { preview: PREVIEWS[i] } : {}),
  }));

  return (
    <ResearchReport
      title="0.14 草案所有权"
      sections={sections}
      sourcesRead={9 + phase * 3}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ResearchReportDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
