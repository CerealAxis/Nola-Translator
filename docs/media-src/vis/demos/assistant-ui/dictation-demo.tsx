"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  Composer,
  ComposerActions,
  ComposerAttachButton,
  ComposerBar,
  ComposerInput,
  ComposerSend,
  ComposerToolbar,
  ComposerVoice,
  ComposerVoiceButton,
} from "../../assistant-ui/elements/composer";
import { useElapsed, useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [1400, 3600, 1600, 3000, 0] as const;
const TRANSCRIPT = "为草稿恢复添加回归测试";

export function ComposerVoiceDemo() {
  const { phase, running, takeOver } = useStoryPhases(PHASES);
  const [value, setValue] = useState("");
  const elapsedTenths = useElapsed(running && phase === 1);
  const recording = running && phase === 1;
  const transcribing = running && phase === 2;
  const active = recording || transcribing;

  const [syncedPhase, setSyncedPhase] = useState(phase);

  if (syncedPhase !== phase) {
    setSyncedPhase(phase);
    if (phase >= 3) setValue(TRANSCRIPT);
  }

  return (
    <Composer>
      <ComposerBar>
        {active ? (
          <ComposerVoice
            recording={recording}
            seconds={Math.floor(elapsedTenths / 10)}
          />
        ) : (
          <ComposerInput
            value={value}
            placeholder="输入消息"
            onChange={(event) => {
              takeOver();
              setValue(event.target.value);
            }}
            onSubmit={() => setValue("")}
          />
        )}
        <ComposerToolbar>
          <ComposerActions>
            <ComposerAttachButton onClick={() => undefined} />
          </ComposerActions>
          <ComposerActions>
            <ComposerVoiceButton active={active} onClick={takeOver} />
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
          <ComposerVoiceDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
