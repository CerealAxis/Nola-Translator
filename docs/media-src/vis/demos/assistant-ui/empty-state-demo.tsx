"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  EmptyState,
  EmptyStateComposer,
  EmptyStateGreeting,
  EmptyStateSuggestion,
  EmptyStateSuggestions,
} from "../../assistant-ui/elements/empty-state";

const SUGGESTIONS = [
  "解释这个仓库",
  "查找问题",
  "编写迁移方案",
] as const;

export function EmptyStateDemo() {
  return (
    <EmptyState>
      <EmptyStateGreeting>我们要做什么？</EmptyStateGreeting>
      <EmptyStateSuggestions>
        {SUGGESTIONS.map((suggestion, i) => (
          <EmptyStateSuggestion key={suggestion} index={i}>
            {suggestion}
          </EmptyStateSuggestion>
        ))}
      </EmptyStateSuggestions>
      <EmptyStateComposer placeholder="输入消息" onSend={() => undefined} />
    </EmptyState>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-3xl py-6">
        <DemoStage>
          <EmptyStateDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
