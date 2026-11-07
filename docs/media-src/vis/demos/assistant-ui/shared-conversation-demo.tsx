"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import {
  SharedConversation,
  type SharedTurn,
} from "../../assistant-ui/elements/shared-conversation";

const TURNS: readonly SharedTurn[] = [
  {
    id: "1",
    role: "user",
    text: "为什么切换会话后草稿还在？",
  },
  {
    id: "2",
    role: "assistant",
    text: "编辑器读取了旧会话的草稿槽位。在切换时清理它即可从根源解决问题。",
  },
];

export function SharedConversationDemo() {
  return (
    <SharedConversation
      title="在会话间恢复草稿"
      sharedBy="harry"
      sharedAt="2 天前"
      turns={TURNS}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <SharedConversationDemo />
      </div>
    </AssistantPreview>
  );
}
