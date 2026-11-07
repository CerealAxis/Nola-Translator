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
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const items = [
  { name: "task", required: true },
  { name: "review", required: true },
  { name: "delivery", required: true },
] as const

const itemClassName =
  "data-active:animate-in data-active:fade-in-0 data-active:slide-in-from-bottom-2 data-active:duration-300 motion-reduce:animate-none"

export function QuestionnaireAnimated() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    toast("智能体工作流已保存", {
      description: `任务： ${formData.get("task") ?? "未填写"} · 审查： ${formData.get("review") ?? "未填写"} · 交付： ${formData.get("delivery") ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      defaultItem="task"
      items={items}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />

      <QuestionnaireItem className={itemClassName} name="task" required>
        <QuestionnaireTitle>智能体应该执行什么操作？</QuestionnaireTitle>
        <QuestionnaireDescription>
          选择本次运行的任务。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="implement">
            实现所要求的更改
          </QuestionnaireChoice>
          <QuestionnaireChoice value="debug">
            调试当前行为
          </QuestionnaireChoice>
          <QuestionnaireChoice value="review">
            审查实现
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem className={itemClassName} name="review" required>
        <QuestionnaireTitle>
          应如何审查这项工作？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          选择验证深度。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="targeted">
            针对性检查
          </QuestionnaireChoice>
          <QuestionnaireChoice value="complete">
            完整测试套件
          </QuestionnaireChoice>
          <QuestionnaireChoice value="manual">
            测试和人工质量检查
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem className={itemClassName} name="delivery" required>
        <QuestionnaireTitle>
          结果应以什么形式交付？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          选择最终交付格式。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="summary">
            简明摘要
          </QuestionnaireChoice>
          <QuestionnaireChoice value="diff">
            摘要和变更文件
          </QuestionnaireChoice>
          <QuestionnaireChoice value="handoff">
            详细的审查交接
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>保存工作流</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
