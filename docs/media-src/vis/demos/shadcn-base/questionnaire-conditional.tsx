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

export function QuestionnaireConditional() {
  const [runtime, setRuntime] = React.useState("local")
  const items = React.useMemo(
    () => [
      { name: "runtime", required: true },
      {
        disabled: runtime !== "cloud",
        name: "environment",
        required: true,
      },
      { name: "approval", required: true },
    ],
    [runtime]
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    toast("执行计划已保存", {
      description: `运行位置： ${formData.get("runtime") ?? "未填写"} · 运行环境： ${formData.get("environment") ?? "不适用"} · 审批： ${formData.get("approval") ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      defaultItem="runtime"
      items={items}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />

      <QuestionnaireItem name="runtime" required>
        <QuestionnaireTitle>智能体应该在哪里运行？</QuestionnaireTitle>
        <QuestionnaireDescription>
          云端运行流程还会询问运行环境。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice
            checked={runtime === "local"}
            value="local"
            onChange={() => setRuntime("local")}
          >
            本地工作区
          </QuestionnaireChoice>
          <QuestionnaireChoice
            checked={runtime === "cloud"}
            value="cloud"
            onChange={() => setRuntime("cloud")}
          >
            云端工作区
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem
        disabled={runtime !== "cloud"}
        name="environment"
        required
      >
        <QuestionnaireTitle>
          应使用哪个云端环境？
        </QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="preview">预览</QuestionnaireChoice>
          <QuestionnaireChoice value="staging">预发布环境</QuestionnaireChoice>
          <QuestionnaireChoice value="isolated">
            隔离沙箱
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="approval" required>
        <QuestionnaireTitle>
          智能体应在何时请求批准？
        </QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="writes">
            写入文件前
          </QuestionnaireChoice>
          <QuestionnaireChoice value="commands">
            运行命令前
          </QuestionnaireChoice>
          <QuestionnaireChoice value="sensitive">
            仅用于敏感操作
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>保存执行计划</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
