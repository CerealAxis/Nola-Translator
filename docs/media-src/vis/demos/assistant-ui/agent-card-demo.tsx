"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  AgentCard,
  type AgentSkill,
} from "../../assistant-ui/elements/agent-card";

const SKILLS: readonly AgentSkill[] = [
  { name: "问题排查", description: "阅读并标注问题" },
  { name: "复现问题", description: "构建最小复现" },
  { name: "编写补丁", description: "提交包含修复的 PR" },
];

export function AgentCardDemo() {
  const [connected, setConnected] = useState(false);

  return (
    <AgentCard
      name="维护代理"
      description="处理问题队列，复现报告中的问题，完成修复并提交 PR。"
      provider="assistant-ui"
      version="1.4.0"
      model="opus"
      endpoint="https://agents.example.com/a2a"
      skills={SKILLS}
      connected={connected}
      onConnect={() => setConnected(true)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <AgentCardDemo />
      </div>
    </AssistantPreview>
  );
}
