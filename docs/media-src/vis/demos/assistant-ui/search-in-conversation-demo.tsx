"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  ConversationSearch,
  type SearchHit,
} from "../../assistant-ui/elements/conversation-search";

const HITS: readonly SearchHit[] = [
  {
    id: "1",
    before: "编辑器从每个会话的槽位读取",
    match: "草稿",
    after: "。",
    position: 12,
  },
  {
    id: "2",
    before: "切换会话时清理",
    match: "草稿",
    after: "即可解决问题。",
    position: 46,
  },
  {
    id: "3",
    before: "为恢复",
    match: "草稿",
    after: "添加一条回归测试。",
    position: 78,
  },
];

export function ConversationSearchDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("草稿");

  return (
    <ConversationSearch
      query={query}
      hits={query === "" ? [] : HITS}
      activeIndex={activeIndex}
      onQueryChange={setQuery}
      onStep={(delta) =>
        setActiveIndex(
          (current) => (current + delta + HITS.length) % HITS.length,
        )
      }
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <ConversationSearchDemo />
      </div>
    </AssistantPreview>
  );
}
