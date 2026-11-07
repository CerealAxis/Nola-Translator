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
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const items = [
  {
    choices: [
      { value: "source" },
      { value: "tests" },
      { value: "docs" },
      { value: "history" },
    ],
    name: "context",
    required: true,
  },
] as const

export function QuestionnaireMultiple() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const context = new FormData(event.currentTarget).getAll("context")

    toast("上下文已选择", {
      description: `上下文： ${context.join(", ") || "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      items={items}
      shortcuts="letters"
      onSubmit={handleSubmit}
    >
      <QuestionnaireItem name="context" multiple required>
        <QuestionnaireTitle>
          智能体应检查哪些上下文？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          选择所有可能影响实现的来源。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="source">
            相关源文件
          </QuestionnaireChoice>
          <QuestionnaireChoice value="tests">
            现有测试
          </QuestionnaireChoice>
          <QuestionnaireChoice value="docs">
            架构文档
          </QuestionnaireChoice>
          <QuestionnaireChoice value="history">
            最近的提交记录
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnaireSubmit>分享上下文</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
