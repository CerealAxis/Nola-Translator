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
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/styles/base-nova/ui/questionnaire"

const items = [
  { name: "permission", required: true },
  { name: "verification", required: true },
] as const

type ItemName = "permission" | "verification"

export function QuestionnaireNavigationState() {
  const [item, setItem] = React.useState<ItemName>("permission")
  const [statuses, setStatuses] = React.useState<
    Record<ItemName, QuestionnaireItemStatus>
  >({
    permission: "unanswered",
    verification: "unanswered",
  })
  const unanswered = statuses[item] === "unanswered"

  function setStatus(name: ItemName, status: QuestionnaireItemStatus) {
    setStatuses((current) => ({ ...current, [name]: status }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    toast("权限已保存", {
      description: `权限： ${formData.get("permission") ?? "未填写"} · 验证： ${formData.get("verification") ?? "未填写"}`,
    })
  }

  return (
    <Questionnaire
      className="mx-auto max-w-md"
      item={item}
      items={items}
      onItemChange={(nextItem) => setItem(nextItem as ItemName)}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />

      <QuestionnaireItem
        name="permission"
        required
        onStatusChange={(status) => setStatus("permission", status)}
      >
        <QuestionnaireTitle>智能体可以修改哪些内容？</QuestionnaireTitle>
        <QuestionnaireDescription>
          选择答案后，“下一步”才会启用。
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="files">项目文件</QuestionnaireChoice>
          <QuestionnaireChoice value="tests">
            项目文件与测试
          </QuestionnaireChoice>
          <QuestionnaireChoice value="config">
            文件、测试和配置
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem
        name="verification"
        required
        onStatusChange={(status) => setStatus("verification", status)}
      >
        <QuestionnaireTitle>
          完成前必须通过哪些检查？
        </QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests">测试</QuestionnaireChoice>
          <QuestionnaireChoice value="types">
            测试和类型检查
          </QuestionnaireChoice>
          <QuestionnaireChoice value="all">
            测试、类型检查和视觉检查
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext
          className="data-[status=unanswered]:opacity-50"
          disabled={unanswered}
          variant="secondary"
        >
          下一步
        </QuestionnaireNext>
        <QuestionnaireSubmit disabled={unanswered}>
          保存权限
        </QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
