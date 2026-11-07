"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useCallback, useContext } from "react";
import {
  ScrollAnchor,
  type ScrollAnchorMessage,
} from "../../assistant-ui/elements/scroll-anchor";
import { DemoStageContext } from "../../assistant-ui/demo-stage";

const MESSAGES: ScrollAnchorMessage[] = [
  { role: "user", text: "为什么流式输出时会话会跳动？" },
  {
    role: "assistant",
    text: "只有当你已在底部时，视口才会固定在底部。这样生成中的布局变化不会打断阅读。",
  },
  { role: "user", text: "如果我向上滚动重读内容呢？" },
  {
    role: "assistant",
    text: "会暂停固定。新的内容继续出现在下方，当前滚动位置保持不动。",
  },
  { role: "user", text: "怎样快速返回底部？" },
  {
    role: "assistant",
    text: "当新内容出现在视野外，会出现返回底部按钮。点击即可继续跟随最新消息。",
  },
  {
    role: "assistant",
    text: "这正是 ScrollToBottom 基础组件负责的行为。",
  },
];

export function ScrollAnchorDemo() {
  const stage = useContext(DemoStageContext);
  const handleSettled = useCallback(() => stage?.setPlaying(false), [stage]);

  return (
    <ScrollAnchor
      messages={MESSAGES}
      paused={stage?.stopped ?? false}
      onSettled={handleSettled}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ScrollAnchorDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
