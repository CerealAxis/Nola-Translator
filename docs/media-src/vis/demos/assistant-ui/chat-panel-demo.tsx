"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ChatPanel,
  ChatPanelComposer,
  ChatPanelMessages,
  ChatPanelTyping,
  ChatPanelUserMessage,
} from "../../assistant-ui/elements/chat-panel";
import { StreamingText } from "../../assistant-ui/elements/streaming-text";
import { useElapsed, useStoryPhases } from "../../assistant-ui/use-demo";

const USER_MESSAGE = "为什么我的草稿不见了？";
const SEGMENTS = [
  {
    text: "草稿 保存在 组件状态里， 所以 切换会话 就会 重置。 现在 运行时 按照 会话 ID 保存 草稿， 返回时 会 自动恢复。",
  },
];
const WORD_COUNT = SEGMENTS[0]!.text.split(" ").length;
const PHASES = [1400, 1500, 3400, 2800] as const;

export function ChatPanelDemo() {
  const { phase, running } = useStoryPhases(PHASES);
  const streamTenths = useElapsed(running && phase === 2);
  const count =
    phase < 2
      ? 0
      : phase === 2
        ? Math.min(Math.floor(streamTenths * 0.9), WORD_COUNT)
        : WORD_COUNT;

  return (
    <ChatPanel>
      <ChatPanelMessages>
        <ChatPanelUserMessage>{USER_MESSAGE}</ChatPanelUserMessage>
        {running && phase === 1 && <ChatPanelTyping />}
        {count > 0 && (
          <StreamingText
            segments={SEGMENTS}
            count={count}
            streaming={running && phase === 2 && count < WORD_COUNT}
            className="text-foreground/70 min-h-0 max-w-[85%] self-start text-xs"
          />
        )}
      </ChatPanelMessages>
      <ChatPanelComposer placeholder="输入消息" onSend={() => undefined} />
    </ChatPanel>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-3xl py-6">
        <DemoStage>
          <ChatPanelDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
