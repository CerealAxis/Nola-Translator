"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  SettingsPanel,
  type SettingToggle,
} from "../../assistant-ui/elements/settings-panel";

const MODELS = ["Opus", "Sonnet", "Haiku"] as const;

const INITIAL: readonly SettingToggle[] = [
  {
    key: "tools",
    label: "工具调用",
    detail: "允许模型调用你的工具",
    on: true,
  },
  {
    key: "memory",
    label: "记忆",
    detail: "在多个会话间保留事实",
    on: false,
  },
];

export function SettingsPanelDemo() {
  const [model, setModel] = useState("Sonnet");
  const [systemPrompt, setSystemPrompt] = useState(
    "你是一名细心的工程助手。优先遵循现有仓库约定。",
  );
  const [temperature, setTemperature] = useState(0.7);
  const [toggles, setToggles] = useState(INITIAL);

  return (
    <SettingsPanel
      model={model}
      models={MODELS}
      systemPrompt={systemPrompt}
      temperature={temperature}
      toggles={toggles}
      onModelChange={setModel}
      onSystemPromptChange={setSystemPrompt}
      onTemperatureChange={setTemperature}
      onToggle={(key) =>
        setToggles((current) =>
          current.map((toggle) =>
            toggle.key === key ? { ...toggle, on: !toggle.on } : toggle,
          ),
        )
      }
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <SettingsPanelDemo />
      </div>
    </AssistantPreview>
  );
}
