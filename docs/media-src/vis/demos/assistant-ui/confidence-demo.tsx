"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  ConfidenceMarker,
  type ConfidenceClaim,
} from "../../assistant-ui/elements/confidence-marker";

const CLAIMS: readonly ConfidenceClaim[] = [
  {
    id: "1",
    text: "输入框拥有从 0.14 开始的草稿。",
    confidence: "grounded",
    basis: "迁移-0.14.md",
  },
  {
    id: "2",
    text: "大多数应用程序将不再需要恢复物效果。\n\n更改后的 API 中的",
    confidence: "inferred",
    basis: "",
  },
  {
    id: "3",
    text: "删除它应该会在每个线程切换上剪切渲染。",
    confidence: "uncertain",
    basis: "未测量",
  },
];

export function ConfidenceMarkerDemo() {
  const [hoveredId, setHoveredId] = useState("");

  return (
    <ConfidenceMarker
      claims={CLAIMS}
      hoveredId={hoveredId}
      onHover={setHoveredId}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ConfidenceMarkerDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
