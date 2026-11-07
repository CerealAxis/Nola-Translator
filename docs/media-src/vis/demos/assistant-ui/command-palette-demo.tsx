"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  CommandPalette,
  type PaletteCommand,
} from "../../assistant-ui/elements/command-palette";

const COMMANDS: readonly PaletteCommand[] = [
  { id: "new", label: "新建会话", group: "会话", keys: ["⌘", "N"] },
  { id: "search", label: "搜索会话", group: "会话", keys: ["⌘", "K"] },
  {
    id: "share",
    label: "分享会话",
    group: "会话",
    keys: ["⌘", "S"],
  },
  { id: "model", label: "切换模型", group: "运行", keys: ["⌘", "M"] },
  { id: "stop", label: "停止运行", group: "运行", keys: ["esc"] },
];

export function CommandPaletteDemo() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("new");

  return (
    <CommandPalette
      commands={COMMANDS}
      query={query}
      activeId={activeId}
      onQueryChange={setQuery}
      onActiveChange={setActiveId}
      onRun={setActiveId}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <CommandPaletteDemo />
      </div>
    </AssistantPreview>
  );
}
