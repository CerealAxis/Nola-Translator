"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import { FeedbackDialog } from "../../assistant-ui/elements/feedback-dialog";

const REASONS = [
  "不符合事实",
  "未遵循说明",
  "太长",
  "不安全",
] as const;

export function FeedbackDialogDemo() {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => {
      setSent(false);
      setSelected([]);
      setNote("");
    }, 2600);
    return () => clearTimeout(id);
  }, [sent]);

  return (
    <FeedbackDialog
      reasons={REASONS}
      selected={selected}
      note={note}
      sent={sent}
      onToggleReason={(reason) =>
        setSelected((current) =>
          current.includes(reason)
            ? current.filter((item) => item !== reason)
            : [...current, reason],
        )
      }
      onNoteChange={setNote}
      onSubmit={() => setSent(true)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><FeedbackDialogDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
