"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/styles/base-nova/ui/button"
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
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const items = [
  { name: "change", required: true },
  { name: "verification", required: true },
  { name: "notes" },
] as const

export function QuestionnaireResume() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const answers = {
      change: formData.get("change"),
      verification: formData.getAll("verification"),
      notes: formData.get("notes"),
    }

    toast("草稿已更新", {
      description: `迁移： ${answers.change ?? "未填写"} · 验证： ${answers.verification.join(", ") || "未填写"} · 备注： ${answers.notes || "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      defaultItem="verification"
      items={items}
      onReset={() => toast("已恢复保存的答复")}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />

      <QuestionnaireItem name="change" required>
        <QuestionnaireTitle>这是什么类型的迁移？</QuestionnaireTitle>
        <QuestionnaireDescription>
          此答复已在上一个会话中保存。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="incremental" defaultChecked>
            渐进式迁移
          </QuestionnaireChoice>
          <QuestionnaireChoice value="cutover">
            一次性切换
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="verification" multiple required>
        <QuestionnaireTitle>
          如何验证此次迁移？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          这些检查项是在上一个会话中选择的。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests" defaultChecked>
            运行迁移测试
          </QuestionnaireChoice>
          <QuestionnaireChoice value="typecheck" defaultChecked>
            运行类型检查
          </QuestionnaireChoice>
          <QuestionnaireChoice value="manual">
            手动执行冒烟测试
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="notes">
        <QuestionnaireTitle>
          还有什么需要 Agent 记住的吗？
        </QuestionnaireTitle>
        <QuestionnaireDescription>
          此备注已随草稿保存。
        </QuestionnaireDescription>
        <QuestionnaireInput
          aria-label="已保存迁移备注"
          defaultValue="保持现有公开 API 稳定。"
        />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <Button type="reset" variant="outline">
          重置更改
        </Button>
        <QuestionnairePrevious />
        <QuestionnaireNext>下一步</QuestionnaireNext>
        <QuestionnaireSubmit>更新草稿</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
