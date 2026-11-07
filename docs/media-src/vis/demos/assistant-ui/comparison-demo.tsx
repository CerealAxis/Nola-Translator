"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import {
  ComparisonCard,
  type ComparisonOption,
} from "../../assistant-ui/elements/comparison-card";

const TRAITS = ["流式输出", "多会话", "自托管"] as const;

const OPTIONS: readonly ComparisonOption[] = [
  {
    id: "local",
    name: "本地运行时",
    headline: "由应用掌控执行流程",
    traits: ["支持流式输出", "多会话", "自托管"],
  },
  {
    id: "external",
    name: "外部状态存储",
    headline: "以外部状态为准",
    traits: ["支持流式输出", "多会话", false],
  },
];

export function ComparisonCardDemo() {
  return (
    <ComparisonCard
      traitLabels={TRAITS}
      options={OPTIONS}
      recommendedId="local"
      reason="如果希望运行时管理流式输出与消息分支，使用本地运行时可以减少接入工作。"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-md py-6">
        <ComparisonCardDemo />
      </div>
    </AssistantPreview>
  );
}
