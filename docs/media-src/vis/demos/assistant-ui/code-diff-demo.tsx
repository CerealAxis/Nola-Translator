"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  CodeDiff,
  type DiffLine,
} from "../../assistant-ui/elements/code-diff";

const LINES: DiffLine[] = [
  { kind: "context", text: "export function Composer() {" },
  { kind: "context", text: "  const threadId = useThreadId();" },
  { kind: "context", text: "  const composer = useComposer();" },
  { kind: "removed", text: "  const [草稿，setDraft] = useState(\"\");" },
  { kind: "added", text: "  const draft = useDraft(threadId);" },
  {
    kind: "added",
    text: "  useEffect(() => hydrate(draft), [threadId]);",
  },
  { kind: "context", text: "  返回（" },
  { kind: "context", text: "    <form onSubmit={composer.send}>" },
  { kind: "context", text: "      {/* … */}" },
];

export function CodeDiffDemo() {
  return (
    <CodeDiff
      filename="composer.tsx"
      additions={2}
      deletions={1}
      lines={LINES}
      cycle={0}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><CodeDiffDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
