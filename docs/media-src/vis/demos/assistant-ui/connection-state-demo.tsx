"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ConnectionState,
  type ConnectionPhase,
} from "../../assistant-ui/elements/connection-state";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [1600, 2400, 0] as const;
const SEQUENCE: readonly ConnectionPhase[] = [
  "dropped",
  "reconnecting",
  "resumed",
];

export function ConnectionStateDemo() {
  const { phase } = useStoryPhases(PHASES);
  const current = SEQUENCE[Math.min(phase, SEQUENCE.length - 1)]!;

  return <ConnectionState phase={current} attempt={2} resumedTokens={184} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ConnectionStateDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
