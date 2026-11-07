"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  PromptLibrary,
  type SavedPrompt,
} from "../../assistant-ui/elements/prompt-library";

const PROMPTS: readonly SavedPrompt[] = [
  {
    id: "1",
    name: "审阅此 PR",
    body: "对照仓库约定审阅 {branch}。先判断是否有必要修改，再检查实现是否正确。",
    variables: ["branch"],
  },
  {
    id: "2",
    name: "编写变更说明",
    body: "为 {package} 编写一行小写的补丁版本说明。",
    variables: ["package"],
  },
  {
    id: "3",
    name: "解释此文件",
    body: "说明此文件的职责，以及它维护了哪些约束。",
    variables: [],
  },
];

export function PromptLibraryDemo() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("1");

  return (
    <PromptLibrary
      prompts={PROMPTS}
      query={query}
      selectedId={selectedId}
      onQueryChange={setQuery}
      onSelect={setSelectedId}
      onInsert={setSelectedId}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <PromptLibraryDemo />
      </div>
    </AssistantPreview>
  );
}
