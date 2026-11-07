"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  MessageQueue,
  type QueuedMessage,
} from "../../assistant-ui/elements/message-queue";

const INITIAL: QueuedMessage[] = [
  { id: "a", text: "还添加变更集" },
  { id: "b", text: "然后运行全套" },
  { id: "c", text: "并在绿色时打开 PR" },
];

export function MessageQueueDemo() {
  const [queued, setQueued] = useState(INITIAL);

  return (
    <MessageQueue
      running="修复转换器并补充边界检查"
      queued={queued}
      onCancel={(id) =>
        setQueued((current) => {
          const next = current.filter((message) => message.id !== id);
          return next.length > 0 ? next : INITIAL;
        })
      }
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><MessageQueueDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
