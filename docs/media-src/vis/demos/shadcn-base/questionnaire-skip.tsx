"use client"

import * as React from "react"
import type { QuestionnaireItemStatus } from "@shadcn/react/questionnaire"
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

const items = [
  { name: "task", required: true },
  { name: "constraints" },
  { name: "review", required: true },
] as const

export function QuestionnaireSkipExample() {
  const [constraintStatus, setConstraintStatus] =
    React.useState<QuestionnaireItemStatus>("unanswered")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const answers = {
      task: formData.get("task"),
      constraints: formData.get("constraints"),
      constraintStatus,
      review: formData.get("review"),
    }

    toast("智能体任务说明已提交", {
      description: `任务： ${answers.task ?? "未填写"} · 约束： ${
        answers.constraintStatus === "skipped"
          ? "已跳过"
          : (answers.constraints ?? "未填写")
      } · 审查： ${answers.review ?? "未填写"}`,
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

      <QuestionnaireItem name="task" required>
        <QuestionnaireTitle>这是什么类型的更改？</QuestionnaireTitle>
        <QuestionnaireDescription>
          选择最符合这项工作的类别。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="feature">新功能</QuestionnaireChoice>
          <QuestionnaireChoice value="fix">缺陷修复</QuestionnaireChoice>
          <QuestionnaireChoice value="refactor">重构</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem
        name="constraints"
        onStatusChange={setConstraintStatus}
      >
        <QuestionnaireTitle>
          是否有实现方面的限制？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          按需作答，也可以主动跳过此问题。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="no-dependencies">
            不要添加依赖项
          </QuestionnaireChoice>
          <QuestionnaireChoice value="no-migrations">
            不要修改数据库
          </QuestionnaireChoice>
          <QuestionnaireChoice value="preserve-api">
            保留公开 API
          </QuestionnaireChoice>
          <QuestionnaireInput
            aria-label="其他实现约束"
            placeholder="描述其他约束…"
          />
        </QuestionnaireChoices>
      </QuestionnaireItem>

      <QuestionnaireItem name="review" required>
        <QuestionnaireTitle>
          应如何审查这项工作？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          选择 Agent 交接前需要完成的检查。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests">
            运行测试套件
          </QuestionnaireChoice>
          <QuestionnaireChoice value="diff">
            审查最终差异
          </QuestionnaireChoice>
          <QuestionnaireChoice value="both">
            测试和差异审查
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>提交摘要</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
