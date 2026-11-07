"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  DaySeparator,
  type DatedMessage,
} from "../../assistant-ui/elements/day-separator";

const MESSAGES: readonly DatedMessage[] = [
  {
    id: "1",
    day: "昨天",
    time: "16:04",
    role: "user",
    text: "为什么草稿在重新加载后仍然存在？",
  },
  {
    id: "2",
    day: "昨天",
    time: "16:04",
    role: "assistant",
    text: "它是按线程持久保存的，因此在安装时会读回该插槽。",
  },
  {
    id: "3",
    day: "今天",
    time: "09:12",
    role: "user",
    text: "跨线程切换？",
  },
  {
    id: "4",
    day: "今天",
    time: "09:12",
    role: "assistant",
    text: "每个线程都拥有自己的插槽，因此它们之间不会泄漏。",
  },
];

export function DaySeparatorDemo() {
  return <DaySeparator messages={MESSAGES} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><DaySeparatorDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
