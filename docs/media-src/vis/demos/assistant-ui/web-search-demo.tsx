"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  WebSearch,
  type WebSearchResult,
} from "../../assistant-ui/elements/web-search";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const QUERY = "assistant-ui草稿持久化";
const RESULTS: readonly WebSearchResult[] = [
  {
    title: "跨线程持久保存输入框状态",
    domain: "assistant-ui.com",
  },
  {
    title: "聊天 UI 中的草稿自动保存模式",
    domain: "patterns.dev",
  },
  {
    title: "useSyncExternalStore 和派生状态",
    domain: "react.dev",
  },
];

const PHASES = [1800, 500, 500, 500, 3000] as const;

export function WebSearchDemo() {
  const { phase } = useStoryPhases(PHASES);
  const visibleResults = Math.min(phase, RESULTS.length);
  const searching = phase < RESULTS.length + 1;

  return (
    <WebSearch
      query={QUERY}
      results={RESULTS}
      visibleResults={visibleResults}
      searching={searching}
      cycle={0}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><WebSearchDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
