"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  DocumentReference,
  type DocumentAnchor,
} from "../../assistant-ui/elements/document-reference";

const ANCHORS: readonly DocumentAnchor[] = [
  {
    page: 4,
    quote:
      "输入框拥有其草稿；不再读取镜像它的父状态。",
  },
  {
    page: 9,
    quote:
      "每个线程保留自己的插槽，在交换机上清除而不是重用。",
  },
];

export function DocumentReferenceDemo() {
  const [activePage, setActivePage] = useState(4);

  return (
    <DocumentReference
      title="迁移-0.14.pdf"
      pages={14}
      anchors={ANCHORS}
      activePage={activePage}
      onJump={setActivePage}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><DocumentReferenceDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
