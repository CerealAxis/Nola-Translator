"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import { ErrorState } from "../../assistant-ui/elements/error-state";

export function ErrorStateDemo() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!retrying) return undefined;
    const id = setTimeout(() => setRetrying(false), 1600);
    return () => clearTimeout(id);
  }, [retrying]);

  return (
    <div className="flex min-h-[4.75rem] w-full max-w-sm items-center">
      <ErrorState
        title="一代已停止"
        detail="该模型在 4,096 个代币后达到输出限制。"
        retrying={retrying}
        onRetry={() => setRetrying(true)}
      />
    </div>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ErrorStateDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
