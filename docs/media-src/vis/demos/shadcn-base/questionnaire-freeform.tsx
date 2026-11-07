"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const items = [
  {
    choices: [
      { value: "incremental" },
      { value: "module" },
      { value: "rewrite" },
    ],
    name: "approach",
    required: true,
  },
] as const

export function QuestionnaireFreeform() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const approach = new FormData(event.currentTarget).get("approach")

    toast("方案已选择", {
      description: `方案： ${approach ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      items={items}
      shortcuts="letters"
      onSubmit={handleSubmit}
    >
      <QuestionnaireItem name="approach" required>
        <QuestionnaireTitle>
          智能体应如何进行这次重构？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          选择一种策略，或填写更具体的指令。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="incremental">
            以最小改动安全地完成任务
          </QuestionnaireChoice>
          <QuestionnaireChoice value="module">
            每次重构一个模块
          </QuestionnaireChoice>
          <QuestionnaireChoice value="rewrite">
            完全替换现有实现
          </QuestionnaireChoice>
          <QuestionnaireInput
            aria-label="其他重构方案"
            placeholder="描述另一种方案…"
          />
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnaireSubmit>使用此方案</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
