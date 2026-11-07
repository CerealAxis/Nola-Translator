"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
import {
  Onboarding,
  type OnboardingStep,
} from "../../assistant-ui/elements/onboarding";

const STEPS: readonly OnboardingStep[] = [
  {
    title: "询问你的代码",
    body: "助手会读取你指定的仓库，你可以针对其中的代码提问。",
    example: "为什么每按一次键都会重新渲染编辑器？",
  },
  {
    title: "交给助手执行",
    body: "它能编辑文件和运行测试，在变更落地前展示差异。",
    example: "修复失败的转换器测试，并补一个回归用例。",
  },
  {
    title: "查看每一步",
    body: "你能查看每次工具调用，有副作用的操作会等待你的批准。",
    example: "运行完整测试并汇总失败项。",
  },
];

export function OnboardingDemo() {
  const [index, setIndex] = useState(0);

  return (
    <Onboarding
      steps={STEPS}
      index={index}
      onNext={() => setIndex((current) => (current + 1) % STEPS.length)}
      onSkip={() => setIndex(0)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <OnboardingDemo />
      </div>
    </AssistantPreview>
  );
}
