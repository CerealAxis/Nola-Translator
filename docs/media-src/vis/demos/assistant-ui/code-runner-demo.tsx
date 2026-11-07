"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import {
  CodeRunner,
  type RunState,
} from "../../assistant-ui/elements/code-runner";

const CODE = `const queue = createMessageQueue(driver);
queue.enqueue("另外添加一份变更记录");
console.log(queue.size);`;

const OUTPUT = ["1", "→ 运行稳定后排水"];

export function CodeRunnerDemo() {
  const [state, setState] = useState<RunState>("ok");

  useEffect(() => {
    if (state !== "running") return;
    const id = setTimeout(() => setState("ok"), 1400);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <CodeRunner
      language="typescript"
      code={CODE}
      state={state}
      output={state === "running" ? [] : OUTPUT}
      {...(state === "ok" ? { durationMs: 38 } : {})}
      onRun={() => setState("running")}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><CodeRunnerDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
