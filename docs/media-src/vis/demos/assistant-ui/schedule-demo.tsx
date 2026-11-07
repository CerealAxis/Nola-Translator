"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  ScheduleCard,
  type ScheduleRun,
} from "../../assistant-ui/elements/schedule-card";

const HISTORY: readonly ScheduleRun[] = [
  { id: "1", at: "今天 06:00", ok: true },
  { id: "2", at: "昨天 06:00", ok: true },
  { id: "3", at: "周六 06:00", ok: false },
];

export function ScheduleCardDemo() {
  const [enabled, setEnabled] = useState(true);

  return (
    <ScheduleCard
      name="整理问题队列"
      cadence="每天 06:00"
      nextRun="明天 06:00"
      enabled={enabled}
      history={HISTORY}
      onToggle={() => setEnabled((current) => !current)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <ScheduleCardDemo />
      </div>
    </AssistantPreview>
  );
}
