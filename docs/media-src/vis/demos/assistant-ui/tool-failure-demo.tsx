"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import { ToolError } from "../../assistant-ui/elements/tool-error";

export function ToolErrorDemo() {
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(1);

  useEffect(() => {
    if (!retrying) return;
    const id = setTimeout(() => {
      setRetrying(false);
      setAttempt((current) => (current >= 3 ? 1 : current + 1));
    }, 1600);
    return () => clearTimeout(id);
  }, [retrying]);

  return (
    <ToolError
      name="fetch"
      target="https://api.example.com/v1/issues"
      message="30000ms后ETIMEDOUT"
      attempt={attempt}
      maxAttempts={3}
      retrying={retrying}
      onRetry={() => setRetrying(true)}
      onSkip={() => setAttempt(1)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ToolErrorDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
