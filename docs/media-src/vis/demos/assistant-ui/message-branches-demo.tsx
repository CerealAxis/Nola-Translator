"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { MessageBranches } from "../../assistant-ui/elements/message-branches";

const VARIANTS = [
  "在运行时中以线程 id 作为键来保存 Composer 草稿。当当前会话发生变化时，将该值读回到编写器中。",
  "将草稿保存在线程键控的运行时映射中，然后在新线程激活时对编写器进行恢复。发送成功后才删除匹配的条目。",
  "将每个草稿视为线程状态而不是组件状态。在线程选择上恢复它可以使输入框保持稳定，而无需添加第二个商店。",
];

export function MessageBranchesDemo() {
  const [index, setIndex] = useState(0);

  return (
    <MessageBranches
      variants={VARIANTS}
      index={index}
      onIndexChange={setIndex}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><MessageBranchesDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
