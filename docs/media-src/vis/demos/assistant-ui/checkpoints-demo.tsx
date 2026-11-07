"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  CheckpointHistory,
  type Checkpoint,
} from "../../assistant-ui/elements/checkpoint-history";

const CHECKPOINTS: readonly Checkpoint[] = [
  { id: "1", label: "修改转换器前", at: "09:41", files: 0 },
  { id: "2", label: "已添加转换器检查", at: "09:58", files: 2 },
  { id: "3", label: "已添加测试", at: "10:12", files: 4 },
  { id: "4", label: "整理格式", at: "10:20", files: 31 },
];

export function CheckpointHistoryDemo() {
  const [currentId, setCurrentId] = useState("3");

  return (
    <CheckpointHistory
      checkpoints={CHECKPOINTS}
      currentId={currentId}
      onRestore={setCurrentId}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <CheckpointHistoryDemo />
      </div>
    </AssistantPreview>
  );
}
