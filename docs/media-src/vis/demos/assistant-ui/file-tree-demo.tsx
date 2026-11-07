"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  FileTree,
  type FileTreeNode,
} from "../../assistant-ui/elements/file-tree";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const NODES: readonly FileTreeNode[] = [
  { path: "packages", name: "包/核心/src", depth: 0, kind: "folder" },
  {
    path: "converter",
    name: "convertMessages.ts",
    depth: 1,
    kind: "file",
    additions: 24,
    deletions: 6,
  },
  {
    path: "converter-test",
    name: "ConvertMessages.test.ts",
    depth: 1,
    kind: "file",
    additions: 41,
  },
  { path: "ui", name: "包/ui/src", depth: 0, kind: "folder" },
  {
    path: "composer",
    name: "composer.tsx",
    depth: 1,
    kind: "file",
    additions: 8,
    deletions: 3,
  },
  {
    path: "changeset",
    name: ".changeset/tidy-pans-shave.md",
    depth: 0,
    kind: "file",
    additions: 5,
  },
];

const PHASES = [420, 420, 420, 420, 420, 0] as const;

export function FileTreeDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <FileTree
      nodes={NODES}
      visibleCount={Math.min(phase + 1, NODES.length)}
      totalAdditions={78}
      totalDeletions={9}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><FileTreeDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
