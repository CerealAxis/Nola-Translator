"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import { MobileComposer } from "../../assistant-ui/elements/mobile-composer";

const ACTIONS = ["摘要", "解释代码", "编写测试", "查找问题"];

export function MobileComposerDemo() {
  const [value, setValue] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  return (
    <MobileComposer
      value={value}
      keyboardOpen={keyboardOpen}
      running={false}
      actions={ACTIONS}
      onValueChange={setValue}
      onAction={(action) => setValue(action)}
      onAttach={() => undefined}
      onFocus={() => setKeyboardOpen(true)}
      onSend={() => {
        setValue("");
        setKeyboardOpen(false);
      }}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-[19rem] py-6">
        <MobileComposerDemo />
      </div>
    </AssistantPreview>
  );
}
