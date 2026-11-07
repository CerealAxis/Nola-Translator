"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  StreamingText,
  type Segment,
} from "../../assistant-ui/elements/streaming-text";
import { useWordStream } from "../../assistant-ui/use-demo";

const SEGMENTS: Segment[] = [
  { text: "新版改动：输入框会恢复各会话的草稿，" },
  { text: "工具调用参数可以边生成边读取，" },
  { text: "可通过" },
  { text: "useAuiState", mono: true },
  { text: "选择器访问。回复开始生成时，" },
  { text: "推理轨迹会自动折叠。" },
];

const TEXT_SEGMENTS = SEGMENTS.map(({ text }) => text);

export function StreamingTextDemo() {
  const { count, streaming } = useWordStream(TEXT_SEGMENTS, {
    interval: 88,
  });

  return (
    <StreamingText
      segments={SEGMENTS}
      count={count}
      streaming={streaming}
      preserveWhitespace
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><StreamingTextDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
