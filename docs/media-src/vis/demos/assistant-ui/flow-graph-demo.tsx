"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  FlowGraph,
  type FlowEdge,
  type FlowNode,
} from "../../assistant-ui/elements/flow-graph";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const NODES: readonly FlowNode[] = [
  { id: "intake", label: "进气", column: 0, row: 1, state: "done" },
  { id: "plan", label: "计划", column: 1, row: 1, state: "done" },
  { id: "search", label: "搜索", column: 2, row: 0, state: "done" },
  { id: "patch", label: "补丁", column: 2, row: 2, state: "active" },
  { id: "verify", label: "验证", column: 3, row: 1, state: "pending" },
];

const EDGES: readonly FlowEdge[] = [
  { from: "intake", to: "plan" },
  { from: "plan", to: "search" },
  { from: "plan", to: "patch" },
  { from: "search", to: "verify" },
  { from: "patch", to: "verify" },
];

const PHASES = [520, 520, 520, 520, 0] as const;

export function FlowGraphDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <FlowGraph
      nodes={NODES}
      edges={EDGES}
      visibleCount={Math.min(phase + 1, NODES.length)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><FlowGraphDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
