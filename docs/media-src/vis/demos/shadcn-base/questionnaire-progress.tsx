"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
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
  { name: "strategy", required: true },
  { name: "tests", required: true },
  { name: "delivery", required: true },
] as const

export function QuestionnaireProgressExample() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    toast("拉取请求计划已就绪", {
      description: `范围： ${formData.get("scope") ?? "未填写"} · 提交方式： ${formData.get("strategy") ?? "未填写"} · 测试： ${formData.get("tests") ?? "未填写"} · 交付： ${formData.get("delivery") ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      defaultItem="scope"
      items={items}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress
        className="w-full"
        render={(props, state) => (
          <div {...props}>
            <div className="mb-2 flex gap-1.5" aria-hidden="true">
              {Array.from({ length: state.total }, (_, index) => (
                <span
                  key={index}
                  className={
                    index < state.current
                      ? "h-1.5 flex-1 rounded-full bg-primary"
                      : "h-1.5 flex-1 rounded-full bg-muted"
                  }
                />
              ))}
            </div>
            <span>
              检查点 {state.current} / {state.total}
            </span>
          </div>
        )}
      />

      <QuestionnaireItem name="scope" required>
        <QuestionnaireTitle>改动范围有多大？</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="small">小型补丁</QuestionnaireChoice>
          <QuestionnaireChoice value="medium">
            单个功能范围的改动
          </QuestionnaireChoice>
          <QuestionnaireChoice value="large">
            跨包改动
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="strategy" required>
        <QuestionnaireTitle>
          提交应如何组织？
        </QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="single">
            单次提交
          </QuestionnaireChoice>
          <QuestionnaireChoice value="logical">
            逻辑提交
          </QuestionnaireChoice>
          <QuestionnaireChoice value="squash">
            审查前合并提交
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="tests" required>
        <QuestionnaireTitle>应该运行哪些测试？</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="targeted">
            针对性测试
          </QuestionnaireChoice>
          <QuestionnaireChoice value="package">
            软件包套件
          </QuestionnaireChoice>
          <QuestionnaireChoice value="workspace">
            整个工作区
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="delivery" required>
        <QuestionnaireTitle>
          工作成果应如何交付？
        </QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="patch">仅补丁</QuestionnaireChoice>
          <QuestionnaireChoice value="commit">
            已在本地提交
          </QuestionnaireChoice>
          <QuestionnaireChoice value="branch">
            推送审查分支
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>完成计划</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
