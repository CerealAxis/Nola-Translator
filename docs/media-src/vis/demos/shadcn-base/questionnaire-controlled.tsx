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
  { name: "scope", required: true },
  { name: "checks", required: true },
  { name: "output", required: true },
] as const

const itemLabels: Record<string, string> = {
  scope: "改动范围",
  checks: "验证方式",
  output: "最终输出",
}

export function QuestionnaireControlled() {
  const [item, setItem] = React.useState("scope")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    toast("智能体工作流已配置", {
      description: `范围： ${formData.get("scope") ?? "未填写"} · 验证： ${formData.get("checks") ?? "未填写"} · 输出： ${formData.get("output") ?? "未填写"}`,
    })
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
      <p
        className="absolute end-0 top-0 text-sm text-muted-foreground"
        role="status"
      >
        当前检查点： {itemLabels[item]}
      </p>

      <Questionnaire
        className="mt-auto"
        item={item}
        items={items}
        onItemChange={setItem}
        onSubmit={handleSubmit}
      >
        <QuestionnaireProgress />

        <QuestionnaireItem name="scope" required>
          <QuestionnaireTitle>智能体可以更改哪些内容？</QuestionnaireTitle>
          <QuestionnaireDescription>
            问卷切换页面时，宿主会保存当前检查点。
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="component">
              仅目标组件
            </QuestionnaireChoice>
            <QuestionnaireChoice value="tests">
              组件及相关测试
            </QuestionnaireChoice>
            <QuestionnaireChoice value="feature">
              完整功能区域
            </QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>

        <QuestionnaireItem name="checks" required>
          <QuestionnaireTitle>
            应使用哪种验证级别？
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="targeted">
              针对性测试
            </QuestionnaireChoice>
            <QuestionnaireChoice value="package">
              软件包测试和类型检查
            </QuestionnaireChoice>
            <QuestionnaireChoice value="full">
              完整工作区验证
            </QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>

        <QuestionnaireItem name="output" required>
          <QuestionnaireTitle>
            智能体完成后应返回什么？
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="summary">
              简明摘要
            </QuestionnaireChoice>
            <QuestionnaireChoice value="diff">
              摘要和变更文件
            </QuestionnaireChoice>
            <QuestionnaireChoice value="handoff">
              详细的实现交接
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
    </div>
  )
}
