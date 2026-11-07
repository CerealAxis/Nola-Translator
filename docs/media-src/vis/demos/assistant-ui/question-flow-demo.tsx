"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useEffect, useState } from "react";
import {
  QuestionFlow,
  type QuestionFlowStep,
} from "../../assistant-ui/elements/question-flow";

const STEPS: readonly QuestionFlowStep[] = [
  {
    id: "audience",
    question: "应把项目动态发送给谁？",
    options: [
      { id: "team", label: "项目团队" },
      { id: "leads", label: "部门负责人" },
      { id: "company", label: "全体同事" },
    ],
  },
  {
    id: "topics",
    question: "动态中应包含哪些内容？",
    description: "选择需要包含的全部内容。",
    selectionMode: "multiple",
    minSelections: 1,
    options: [
      { id: "milestones", label: "里程碑" },
      { id: "risks", label: "待处理风险" },
      { id: "next", label: "下一步" },
    ],
  },
  {
    id: "timing",
    question: "何时发送？",
    options: [
      { id: "today", label: "今天" },
      { id: "monday", label: "周一上午" },
      { id: "review", label: "审阅后" },
    ],
  },
];

export function QuestionFlowDemo() {
  const [choice, setChoice] = useState<Record<string, string[]> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (choice === undefined) return;
    const id = setTimeout(() => setChoice(undefined), 2600);
    return () => clearTimeout(id);
  }, [choice]);

  return (
    <QuestionFlow
      key={choice === undefined ? "open" : "receipt"}
      steps={STEPS}
      choice={choice}
      onComplete={(answers) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setChoice(answers);
            resolve();
          }, 700);
        })
      }
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <QuestionFlowDemo />
      </div>
    </AssistantPreview>
  );
}
