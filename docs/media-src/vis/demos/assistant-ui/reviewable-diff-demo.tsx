"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  ReviewableDiff,
  type DiffHunk,
  type HunkDecision,
} from "../../assistant-ui/elements/reviewable-diff";

const HUNKS: readonly DiffHunk[] = [
  {
    id: "h1",
    range: "@@ -12,6 +12,7",
    decision: "pending",
    lines: [
      { kind: "context", text: "  const composer = useComposer();" },
      { kind: "removed", text: "  const [草稿，setDraft] = useState(\"\");" },
      { kind: "added", text: "  const draft = useDraft(threadId);" },
    ],
  },
  {
    id: "h2",
    range: "@@ -31,4 +32,5",
    decision: "pending",
    lines: [
      { kind: "context", text: "  useEffect(() => {" },
      { kind: "added", text: "    if (!threadId) 返回；" },
      { kind: "context", text: "    恢复物（草案）；" },
    ],
  },
];

export function ReviewableDiffDemo() {
  const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});

  const decide = (id: string, decision: HunkDecision) =>
    setDecisions((current) => ({ ...current, [id]: decision }));

  return (
    <ReviewableDiff
      filename="composer.tsx"
      hunks={HUNKS.map((hunk) => ({
        ...hunk,
        decision: decisions[hunk.id] ?? "pending",
      }))}
      onKeep={(id) => decide(id, "kept")}
      onDiscard={(id) => decide(id, "discarded")}
      onApply={() => setDecisions({})}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ReviewableDiffDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
