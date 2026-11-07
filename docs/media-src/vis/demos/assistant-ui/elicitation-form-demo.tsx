"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import {
  ElicitationForm,
  type ElicitationField,
  type ElicitationState,
} from "../../assistant-ui/elements/elicitation-form";

const INITIAL_FIELDS: readonly ElicitationField[] = [
  {
    name: "repo",
    label: "存储库",
    value: "assistant-ui/assistant-ui",
    kind: "text",
    required: true,
  },
  {
    name: "visibility",
    label: "可见性",
    value: "私人",
    kind: "choice",
    options: ["公共", "私人"],
  },
  { name: "notify", label: "通知观察者", value: "true", kind: "toggle" },
];

export function ElicitationFormDemo() {
  const [state, setState] = useState<ElicitationState>("request");
  const [fields, setFields] = useState(INITIAL_FIELDS);

  useEffect(() => {
    if (state === "request") return;
    const id = setTimeout(() => setState("request"), 2400);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <ElicitationForm
      server="github-mcp"
      message="在工具运行之前确认应在何处发布发行说明。"
      fields={fields}
      state={state}
      onFieldChange={(name, value) =>
        setFields((current) =>
          current.map((item) =>
            item.name === name ? { ...item, value } : item,
          ),
        )
      }
      onAccept={() => setState("accepted")}
      onDecline={() => setState("declined")}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ElicitationFormDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
