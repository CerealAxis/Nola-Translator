"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { EditMessage } from "../../assistant-ui/elements/edit-message";

const ORIGINAL = "解释输入框如何保留其草稿。";

export function EditMessageDemo() {
  const [value, setValue] = useState(ORIGINAL);
  const [editing, setEditing] = useState(true);

  return (
    <EditMessage
      value={value}
      discardedReplies={3}
      editing={editing}
      onValueChange={setValue}
      onStartEdit={() => setEditing(true)}
      onCancel={() => {
        setValue(ORIGINAL);
        setEditing(false);
      }}
      onSave={() => setEditing(false)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><EditMessageDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
