"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  CanvasSplit,
  CanvasSplitBody,
  CanvasSplitDocument,
  CanvasSplitHeader,
  CanvasSplitLine,
  CanvasSplitMessage,
  CanvasSplitThread,
} from "../../assistant-ui/elements/canvas-split";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const MESSAGES = [
  {
    id: "u1",
    speaker: "user" as const,
    text: "起草 0.14 的迁移说明",
  },
  {
    id: "a1",
    speaker: "assistant" as const,
    text: "已在画布中打开文档，正在编辑。",
  },
];

const LINES: readonly { text: string; heading?: boolean }[] = [
  { text: "迁移到 0.14", heading: true },
  {
    text: "编辑器现在自行管理草稿，因此不再读取父组件中的 `useState`。",
  },
  {
    text: "改用 `useDraft(threadId)` 读取本地草稿，并移除恢复状态的 effect。",
  },
  {
    text: "编辑期间切换会话时，各会话会保留自己的草稿。",
  },
];

const PHASES = [900, 900, 900, 900, 0] as const;

export function CanvasSplitDemo() {
  const { phase } = useStoryPhases(PHASES);
  const visible = Math.min(phase, LINES.length);

  return (
    <CanvasSplit>
      <CanvasSplitThread>
        {MESSAGES.map((message) => (
          <CanvasSplitMessage key={message.id} speaker={message.speaker}>
            {message.text}
          </CanvasSplitMessage>
        ))}
      </CanvasSplitThread>
      <CanvasSplitDocument>
        <CanvasSplitHeader
          title="migration-0.14.md"
          version={3}
          saved={visible >= LINES.length}
          onCopy={() => undefined}
          onClose={() => undefined}
        />
        <CanvasSplitBody writing={visible < LINES.length}>
          {LINES.slice(0, visible).map((line) => (
            <CanvasSplitLine
              key={line.text}
              {...(line.heading ? { heading: true } : {})}
            >
              {line.text}
            </CanvasSplitLine>
          ))}
        </CanvasSplitBody>
      </CanvasSplitDocument>
    </CanvasSplit>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-3xl py-6">
        <DemoStage>
          <CanvasSplitDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
