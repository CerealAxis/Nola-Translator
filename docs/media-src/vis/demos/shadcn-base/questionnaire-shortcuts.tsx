"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  NativeSelect,
  NativeSelectOption,
} from "@/styles/base-nova/ui/native-select"
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
    choices: [{ value: "inspect" }, { value: "tests" }, { value: "patch" }],
    name: "action",
    required: true,
  },
] as const

type ShortcutMode = React.ComponentProps<typeof Questionnaire>["shortcuts"]

export function QuestionnaireShortcuts() {
  const [shortcuts, setShortcuts] = React.useState<ShortcutMode>("letters")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const action = new FormData(event.currentTarget).get("action")

    toast("下一步操作已选择", {
      description: `操作： ${action ?? "未填写"} · 快捷键： ${shortcuts ?? "无"}`,
    })
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
      <NativeSelect
        aria-label="快捷键样式"
        className="absolute end-0 top-0"
        value={shortcuts ?? "无"}
        onChange={(event) => {
          const value = event.target.value
          setShortcuts(
            value === "letters" || value === "numbers" ? value : undefined
          )
        }}
      >
        <NativeSelectOption value="none">暂无快捷方式</NativeSelectOption>
        <NativeSelectOption value="letters">字母</NativeSelectOption>
        <NativeSelectOption value="numbers">数字</NativeSelectOption>
      </NativeSelect>

      <Questionnaire
        className="mt-auto"
        items={items}
        shortcuts={shortcuts}
        onSubmit={handleSubmit}
      >
        <QuestionnaireItem name="action" required>
          <QuestionnaireTitle>
            智能体接下来应该做什么？
          </QuestionnaireTitle>
          <QuestionnaireDescription>
            使用显示的快捷键，或通过键盘导航。
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="inspect">
              检查实现
            </QuestionnaireChoice>
            <QuestionnaireChoice value="tests">
              运行相关测试
            </QuestionnaireChoice>
            <QuestionnaireChoice value="patch">
              准备补丁
            </QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>

        <QuestionnaireActions>
          <QuestionnaireSubmit>确认操作</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  )
}
