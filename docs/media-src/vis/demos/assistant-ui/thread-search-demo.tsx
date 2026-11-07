"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  ThreadSearch,
  type SearchableThread,
} from "../../assistant-ui/elements/thread-search";

const THREADS: readonly SearchableThread[] = [
  {
    id: "1",
    title: "在会话间恢复草稿",
    group: "今天",
    preview: "切换时清理槽位",
    pinned: true,
  },
  {
    id: "2",
    title: "转换器丢弃空片段",
    group: "今天",
    preview: "已添加检查，测试通过",
  },
  {
    id: "3",
    title: "组件覆盖分析",
    group: "昨天",
    preview: "63 candidates, graded",
  },
  {
    id: "4",
    title: "队列顺序问题",
    group: "更早",
    preview: "直接入队超过缓冲消息",
  },
];

export function ThreadSearchDemo() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("2");
  const [openId, setOpenId] = useState("2");
  const openThread = THREADS.find((thread) => thread.id === openId);

  return (
    <div className="flex flex-col gap-3">
      <ThreadSearch
        threads={THREADS}
        query={query}
        activeId={activeId}
        onQueryChange={setQuery}
        onActiveChange={setActiveId}
        onSelect={setOpenId}
      />
      <p className="text-foreground/50 text-sm">
        已打开会话： {openThread?.title}
      </p>
    </div>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <ThreadSearchDemo />
      </div>
    </AssistantPreview>
  );
}
