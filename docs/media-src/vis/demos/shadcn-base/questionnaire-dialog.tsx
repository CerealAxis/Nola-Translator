"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-nova/ui/dialog"
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
  { name: "tests", required: true },
] as const

export function QuestionnaireDialog() {
  const [open, setOpen] = React.useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setOpen(false)
    toast("补充说明已发送", {
      description: `范围： ${formData.get("scope") ?? "未填写"} · 验证： ${formData.get("tests") ?? "未填写"}`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        打开补充说明
      </DialogTrigger>
      <DialogContent>
        <Questionnaire
          defaultItem="scope"
          items={items}
          onSubmit={handleSubmit}
        >
          <QuestionnaireItem name="scope" required>
            <DialogHeader>
              <QuestionnaireProgress />
              <QuestionnaireTitle render={<DialogTitle />}>
                涉及哪些文件？
              </QuestionnaireTitle>
              <QuestionnaireDescription render={<DialogDescription />}>
                选择 Agent 可以修改工作区的范围。
              </QuestionnaireDescription>
            </DialogHeader>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="component">
                仅组件
              </QuestionnaireChoice>
              <QuestionnaireChoice value="feature">
                完整功能目录
              </QuestionnaireChoice>
              <QuestionnaireChoice value="workspace">
                任何相关的工作区文件
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>

          <QuestionnaireItem name="tests" required>
            <DialogHeader>
              <QuestionnaireProgress />
              <QuestionnaireTitle render={<DialogTitle />}>
                需要进行多大范围的验证？
              </QuestionnaireTitle>
              <QuestionnaireDescription render={<DialogDescription />}>
                选择 Agent 交接前应运行的检查。
              </QuestionnaireDescription>
            </DialogHeader>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="targeted">
                针对性测试
              </QuestionnaireChoice>
              <QuestionnaireChoice value="package">
                软件包测试
              </QuestionnaireChoice>
              <QuestionnaireChoice value="full">
                完整工作区验证
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <QuestionnaireActions>
              <QuestionnairePrevious />
              <QuestionnaireNext>下一步</QuestionnaireNext>
              <QuestionnaireSubmit>发送答复</QuestionnaireSubmit>
            </QuestionnaireActions>
          </DialogFooter>
        </Questionnaire>
      </DialogContent>
    </Dialog>
  )
}
