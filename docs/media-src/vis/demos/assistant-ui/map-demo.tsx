"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  MapAnswer,
  type MapPin,
} from "../../assistant-ui/elements/map-answer";

const PINS: readonly MapPin[] = [
  { id: "a", label: "轮渡大厦", detail: "启动", x: 22, y: 68 },
  { id: "b", label: "Salesforce 园区", detail: "8 分钟", x: 48, y: 44 },
  { id: "c", label: "耶尔巴布埃纳花园", detail: "14 分钟", x: 74, y: 26 },
];

export function MapAnswerDemo() {
  const [activeId, setActiveId] = useState("b");

  return (
    <MapAnswer pins={PINS} activeId={activeId} route onSelect={setActiveId} />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><MapAnswerDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
