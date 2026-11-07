"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { GuardrailNotice } from "../../assistant-ui/elements/guardrail-notice";

const ALTERNATIVES = [
  "解释速率限制如何防御这种情况",
  "检查我自己的服务是否存在同样的弱点",
];

export function GuardrailNoticeDemo() {
  return (
    <GuardrailNotice
      title="我无能为力"
      explanation="该请求涉及攻击不属于你的基础设施。我可以协助分析如何防范同类攻击。"
      policy="policy"
      alternatives={ALTERNATIVES}
      onPick={() => undefined}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><GuardrailNoticeDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
