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
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const questionnaireItems = [
  {
    choices: [
      {
        description: "展示 Agent 执行的操作及返回结果。",
        label: "工具调用时间线",
        value: "tool-calls",
      },
      {
        description: "执行敏感或破坏性操作前先询问。",
        label: "审批节点",
        value: "approvals",
      },
      {
        description: "让委派的任务和结果更清晰。",
        label: "子代理交接",
        value: "handoffs",
      },
    ],
    description: "选择一个方向，或描述其他任务。",
    input: {
      label: "其他 Agent 功能",
      placeholder: "描述其他功能…",
    },
    name: "direction",
    required: true,
    title: "接下来让 Agent 实现什么？",
  },
  {
    choices: [
      { label: "进度", value: "progress" },
      { label: "决策", value: "decisions" },
      { label: "风险", value: "risks" },
      { label: "下一步", value: "next-step" },
    ],
    description: "可多选，也可以跳过此问题。",
    multiple: true,
    name: "signals",
    required: false,
    title: "每次进度更新应包含什么？",
  },
  {
    choices: [
      { label: "立即开始", value: "now" },
      { label: "下一个开发周期", value: "next-cycle" },
      { label: "加入待办列表", value: "backlog" },
    ],
    description: "选择 Agent 开始工作的时间。",
    name: "timing",
    required: true,
    title: "何时开始？",
  },
] as const

export function QuestionnaireDemo() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const answers = {
      direction: formData.get("direction"),
      signals: formData.getAll("signals"),
      timing: formData.get("timing"),
    }

    toast("智能体计划已保存", {
      description: `方向： ${answers.direction ?? "未填写"} · 进度信号： ${answers.signals.join(", ") || "未填写"} · 时间： ${answers.timing ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      defaultItem="direction"
      items={questionnaireItems}
      shortcuts="letters"
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />
      {questionnaireItems.map((question) => (
        <QuestionnaireItem
          key={question.name}
          multiple={"multiple" in question && question.multiple}
          name={question.name}
          required={question.required}
        >
          <QuestionnaireTitle>{question.title}</QuestionnaireTitle>
          <QuestionnaireDescription>
            {question.description}
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            {question.choices.map((choice) => (
              <QuestionnaireChoice key={choice.value} value={choice.value}>
                <span className="font-medium">{choice.label}</span>
                {"description" in choice ? (
                  <span className="text-muted-foreground">
                    {choice.description}
                  </span>
                ) : null}
              </QuestionnaireChoice>
            ))}
            {"input" in question ? (
              <QuestionnaireInput
                aria-label={question.input.label}
                placeholder={question.input.placeholder}
              />
            ) : null}
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>保存计划</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
