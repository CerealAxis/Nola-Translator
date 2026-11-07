"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  Composer,
  ComposerActions,
  ComposerAttachButton,
  ComposerBar,
  ComposerContext,
  ComposerInput,
  ComposerSend,
  ComposerToolbar,
} from "../../assistant-ui/elements/composer";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [1200, 1200, 0] as const;
const MESSAGES = [54, 118, 162] as const;

export function ComposerContextDemo() {
  const { phase } = useStoryPhases(PHASES);
  const [value, setValue] = useState("");

  return (
    <Composer>
      <ComposerBar>
        <ComposerInput
          value={value}
          placeholder="输入消息"
          onChange={(event) => setValue(event.target.value)}
          onSubmit={() => setValue("")}
        />
        <ComposerToolbar>
          <ComposerActions>
            <ComposerAttachButton onClick={() => undefined} />
          </ComposerActions>
          <ComposerActions>
            <ComposerContext
              usage={{
                system: 12,
                tools: 8,
                messages: MESSAGES[Math.min(phase, 2)] ?? 162,
                total: 200,
              }}
            />
            <ComposerSend
              streaming={false}
              idle={value.length === 0}
              onClick={() => setValue("")}
            />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <ComposerContextDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
