"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useEffect, useState } from "react";
import {
  RecommendationCard,
  type RecommendationState,
} from "../../assistant-ui/elements/recommendation-card";

export function RecommendationCardDemo() {
  const [state, setState] = useState<RecommendationState>("idle");

  useEffect(() => {
    if (state !== "accepted") return;
    const id = setTimeout(() => setState("idle"), 2600);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <RecommendationCard
      state={state}
      question="启用草稿自动保存？"
      confidenceLabel="置信度高"
      acceptedLabel="已为所有会话启用"
      onAccept={() => setState("accepted")}
    >
      切换会话时会丢失草稿。接入{" "}
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        runtime.drafts
      </span>{" "}
      只需{" "}
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        3 行代码
      </span>{" "}
      ，无需迁移。
    </RecommendationCard>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <RecommendationCardDemo />
      </div>
    </AssistantPreview>
  );
}
