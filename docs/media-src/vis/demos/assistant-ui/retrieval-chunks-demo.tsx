"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  RetrievalChunks,
  type RetrievalChunk,
} from "../../assistant-ui/elements/retrieval-chunks";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const CHUNKS: readonly RetrievalChunk[] = [
  {
    id: "c1",
    source: "迁移-0.14.md",
    locator: "§ 2",
    score: 0.91,
    text: "输入框拥有从 0.14 开始的草稿。反映草稿的父状态不再被读取，应该被删除。",
  },
  {
    id: "c2",
    source: "composer.tsx",
    locator: "L12–31",
    score: 0.84,
    text: "useDraft(threadId) 订阅每个线程的草稿槽，并在线程更改时清除它。",
  },
  {
    id: "c3",
    source: "CHANGELOG.md",
    locator: "0.14.0",
    score: 0.62,
    text: "修复（react-lexical）：清除线程切换上的陈旧草稿。",
  },
];

const PHASES = [1400, 700, 700, 0] as const;

export function RetrievalChunksDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <RetrievalChunks
      query="草稿如何恢复"
      chunks={CHUNKS}
      visibleCount={phase === 0 ? 0 : Math.min(phase, CHUNKS.length)}
      searching={phase === 0}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><RetrievalChunksDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
