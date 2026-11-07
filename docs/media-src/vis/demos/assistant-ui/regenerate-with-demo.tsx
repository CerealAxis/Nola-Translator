"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  RegenerateMenu,
  type RegenerateOption,
} from "../../assistant-ui/elements/regenerate-menu";

const OPTIONS: readonly RegenerateOption[] = [
  { id: "opus", label: "使用 Opus 5 重试", detail: "较慢" },
  { id: "sonnet", label: "用 Sonnet 5 重试", detail: "平衡" },
  { id: "haiku", label: "用俳句 4.5 重试", detail: "最快" },
];

export function RegenerateMenuDemo() {
  const [open, setOpen] = useState(true);

  return (
    <RegenerateMenu
      options={OPTIONS}
      open={open}
      currentId="sonnet"
      onOpenChange={setOpen}
      onPick={() => setOpen(false)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><RegenerateMenuDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
