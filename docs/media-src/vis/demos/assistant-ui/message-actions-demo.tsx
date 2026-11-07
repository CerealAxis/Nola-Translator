"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import {
  MessageActions,
  type Reaction,
} from "../../assistant-ui/elements/message-actions";
import { useCopyToClipboard } from "../../assistant-ui/hooks/use-copy-to-clipboard";

export function MessageActionsDemo() {
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    copiedDuration: 1400,
  });
  const [reaction, setReaction] = useState<Reaction>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!regenerating) return undefined;
    const id = setTimeout(() => setRegenerating(false), 900);
    return () => clearTimeout(id);
  }, [regenerating]);

  return (
    <MessageActions
      copied={isCopied}
      reaction={reaction}
      regenerating={regenerating}
      onCopy={() => copyToClipboard("...")}
      onReactionChange={setReaction}
      onRegenerate={() => setRegenerating(true)}
      onMore={() => {}}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><MessageActionsDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
