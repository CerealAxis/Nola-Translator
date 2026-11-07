"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  SpeakerIdentity,
  type SpeakerTurn,
} from "../../assistant-ui/elements/speaker-identity";

const TURNS: readonly SpeakerTurn[] = [
  {
    id: "1",
    kind: "user",
    name: "你\n\n上面的",
    text: "找出转换器匝数下降的原因。",
  },
  {
    id: "2",
    kind: "agent",
    name: "维护者",
    detail: "作品",
    text: "拆分：一名工人读取转换器，一名工人读取测试。\n\n当零件为空时，",
  },
  {
    id: "3",
    kind: "subagent",
    name: "reader",
    detail: "俳句",
    text: "ConvertMessages 会提前返回。",
  },
  {
    id: "4",
    kind: "tool",
    name: "read_file",
    detail: "42ms",
    text: "包/core/src/convertMessages.ts",
  },
];

export function SpeakerIdentityDemo() {
  return <SpeakerIdentity turns={TURNS} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><SpeakerIdentityDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
