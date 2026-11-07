"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  Timeline,
  type TimelineEvent,
} from "../../assistant-ui/elements/timeline";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const EVENTS: readonly TimelineEvent[] = [
  {
    id: "1",
    when: "past",
    time: "09:02",
    title: "提交问题",
    detail: "会话切换后草稿仍保留",
  },
  { id: "2", when: "past", time: "09:40", title: "已复现" },
  {
    id: "3",
    when: "now",
    time: "10:15",
    title: "修复待审阅",
    detail: "切换会话时清理草稿槽位",
  },
  { id: "4", when: "future", time: "11:00", title: "发布 0.14.1" },
];

const PHASES = [600, 600, 600, 0] as const;

export function TimelineDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <Timeline
      events={EVENTS}
      visibleCount={Math.min(phase + 1, EVENTS.length)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <TimelineDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
