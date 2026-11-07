"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { StoppedRun } from "../../assistant-ui/elements/stopped-run";
import { useWordStream } from "../../assistant-ui/use-demo";

const TEXT =
  "输入框会读取当前会话的草稿，因此编辑途中切换会话也不会丢失内容。";

export function StoppedRunDemo() {
  const { words, count } = useWordStream(TEXT, { interval: 90 });

  return <StoppedRun words={words.slice(0, count)} wordSeparator="" reason="你已停止生成" />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><StoppedRunDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
