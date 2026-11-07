"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  Frac,
  MathBlock,
  Sub,
  Sup,
} from "../../assistant-ui/elements/math-block";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [900, 900, 0] as const;

export function MathBlockDemo() {
  const { phase } = useStoryPhases(PHASES);

  const steps = [
    {
      expression: (
        <>
          p(x) ={" "}
          <Frac
            over={<>1</>}
            under={
              <>
                1 + e<Sup>−x</Sup>
              </>
            }
          />
        </>
      ),
      note: "物流",
    },
    {
      expression: <>p′(x) = p(x)·(1 − p(x))</>,
      note: "其衍生品",
    },
    {
      expression: (
        <>
          最大<Sub>x</Sub> p′(x) = 0.25 x = 0
        </>
      ),
      note: "中点最陡",
    },
  ];

  return (
    <MathBlock
      label="推导"
      steps={steps}
      visibleSteps={Math.min(phase + 1, steps.length)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><MathBlockDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
