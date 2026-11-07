"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { QuotaBanner } from "../../assistant-ui/elements/quota-banner";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [1400, 1400, 0] as const;
const USED = [32, 44, 47] as const;

export function QuotaBannerDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <QuotaBanner
      used={USED[Math.min(phase, USED.length - 1)] ?? 47}
      limit={50}
      unit="条消息"
      resetsIn="3h 12m"
      upgradeLabel="升级"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <QuotaBannerDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
