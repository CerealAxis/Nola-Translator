"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  Citation,
  InlineCitation,
  type Source,
} from "../../assistant-ui/elements/inline-citation";

const SOURCES = [
  {
    domain: "assistant-ui.com",
    title: "运行时乐观更新",
    snippet:
      "运行时立即应用本地编辑，并在服务器确认写入后协调它们。",
  },
  {
    domain: "react.dev",
    title: "useSyncExternalStore 参考",
    snippet:
      "将组件订阅到外部存储，并在每次存储更改时使用一致的快照重新渲染。",
  },
] as const satisfies readonly Source[];

export function InlineCitationDemo() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <InlineCitation>
      乐观更新在服务器确认时保持线程响应
      写
      <Citation
        index={0}
        source={SOURCES[0]}
        open={openIndex === 0}
        onOpenChange={(open) => setOpenIndex(open ? 0 : null)}
      />
      。商店已经为每个订阅者公开了一致的快照
      <Citation
        index={1}
        source={SOURCES[1]}
        open={openIndex === 1}
        onOpenChange={(open) => setOpenIndex(open ? 1 : null)}
      />
      ，因此不需要额外的调节通道。
    </InlineCitation>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><InlineCitationDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
