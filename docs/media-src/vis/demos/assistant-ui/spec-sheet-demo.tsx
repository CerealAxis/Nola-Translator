"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  SpecSheet,
  type SpecRow,
} from "../../assistant-ui/elements/spec-sheet";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const ROWS: readonly SpecRow[] = [
  { label: "上下文", value: "1,000,000 代币" },
  { label: "输入", value: "$4.00 / M" },
  { label: "输出", value: "$20.00 / M" },
  { label: "视觉", value: "yes" },
  { label: "知识", value: "2026 年 5 月" },
  { label: "最适合", value: "长代理运行", emphasis: true },
];

const PHASES = [260, 260, 260, 260, 260, 0] as const;

export function SpecSheetDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <SpecSheet
      title="作品 5.5"
      subtitle="克劳德-opus-5-5"
      rows={ROWS}
      visibleCount={Math.min(phase + 1, ROWS.length)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><SpecSheetDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
