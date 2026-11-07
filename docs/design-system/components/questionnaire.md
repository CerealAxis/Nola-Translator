---
title: Questionnaire（问卷）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Questionnaire（问卷）

支持单选、多选、自由作答和可跳过问题的多步问卷。

<demo react="shadcn-base/questionnaire-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add questionnaire
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install @shadcn/react
```

**2. 将以下代码复制并粘贴到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/questionnaire.tsx [components/ui/questionnaire.tsx]

**3. 更新导入路径，使其与项目配置一致。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx
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
} from "@/components/ui/questionnaire"
```

```tsx
const items = [
  {
    name: "direction",
    required: true,
    prompt: "What should we prototype next?",
    description: "Choose a direction or write your own.",
    choices: [
      {
        value: "delegation",
        label: "Delegation",
        description: "Show how work moves to a specialist.",
      },
      {
        value: "questions",
        label: "Question prompts",
        description: "Show choices while the interface waits.",
      },
      { value: "both", label: "Both together" },
    ],
    input: { label: "Another answer", placeholder: "Type another answer…" },
  },
  {
    name: "detail",
    required: false,
    prompt: "How much detail should it include?",
    description: "Skip this if you are not sure yet.",
    choices: [
      { value: "focused", label: "Focused" },
      { value: "complete", label: "Complete flow" },
    ],
  },
] as const
```

只需定义一次题目集合。将其传给 `Questionnaire`，以便在服务端渲染
进度、操作和快捷键，再将集合映射到各个部件。

```tsx
<Questionnaire items={items} onSubmit={handleSubmit}>
  <QuestionnaireProgress />
  {items.map((question) => (
    <QuestionnaireItem
      key={question.name}
      name={question.name}
      required={question.required}
    >
      <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
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
    <QuestionnaireNext />
    <QuestionnaireSubmit />
  </QuestionnaireActions>
</Questionnaire>
```

```tsx
function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const answers = new FormData(event.currentTarget)
  // answers.get("direction"), answers.getAll(...) for multiple items.
}
```

## 组件结构 {#composition}

```text
Questionnaire
├── QuestionnaireProgress
├── QuestionnaireItem
│   ├── QuestionnaireTitle
│   ├── QuestionnaireDescription
│   ├── QuestionnaireChoices
│   │   ├── QuestionnaireChoice
│   │   └── QuestionnaireInput
│   └── QuestionnaireError
└── QuestionnaireActions
    ├── QuestionnairePrevious
    ├── QuestionnaireSkip
    ├── QuestionnaireNext
    └── QuestionnaireSubmit
```

Questionnaire 管理题目顺序、当前题目、答案状态、验证、
进度和导航。外层页面、卡片、对话框或抽屉负责
关闭和取消行为、持久化、数据传输及分支逻辑。

## 服务端渲染 {#server-rendering}

传入 `items`，在服务端渲染当前题目、进度、操作和答题
快捷键。有关完整行为，请参阅
[无样式 Questionnaire](https://ui.shadcn.com/docs/react/questionnaire)。

## 多选 {#multiple-selection}

对于允许选择多个预设答案的题目，使用 `multiple`。

<demo react="shadcn-base/questionnaire-multiple.tsx" />

## 自由作答 {#freeform-answer}

如果用户可以自行填写其他答案，请将 `QuestionnaireInput` 与预设选项组合使用。

<demo react="shadcn-base/questionnaire-freeform.tsx" />

## 主动跳过 {#explicit-skip}

如果允许用户主动跳过选答题，请添加 `QuestionnaireSkip`。

<demo react="shadcn-base/questionnaire-skip.tsx" />

## 快捷键 {#shortcuts}

使用 `shortcuts` 为每个答案分配一个字母键或数字键。

<demo react="shadcn-base/questionnaire-shortcuts.tsx" />

## 自定义验证 {#custom-validation}

将受控导航与 Zod 等外部验证架构结合使用，可以返回验证失败的题目并显示错误。

<demo react="shadcn-base/questionnaire-validation.tsx" />

## 受控 {#controlled}

通过外层状态控制当前题目，例如返回验证失败的步骤。

<demo react="shadcn-base/questionnaire-controlled.tsx" />

## 恢复 {#resume}

恢复已保存的当前题目和默认答案，然后将更改重置为该保存状态。

<demo react="shadcn-base/questionnaire-resume.tsx" />

## 条件题目 {#conditional-items}

根据用户之前的答案，禁用不适用的题目。

<demo react="shadcn-base/questionnaire-conditional.tsx" />

## 导航状态 {#navigation-state}

读取题目状态，以便按需禁用导航并自定义操作样式。

<demo react="shadcn-base/questionnaire-navigation-state.tsx" />

## 自定义进度 {#custom-progress}

使用 Progress 的渲染状态构建自定义进度指示器。

<demo react="shadcn-base/questionnaire-progress.tsx" />

## 题目动画 {#animated-items}

为当前题目添加动画，同时保持进度和导航的位置固定。

<demo react="shadcn-base/questionnaire-animated.tsx" />

## 卡片 {#card}

将 Questionnaire 与 Card 插槽组合使用，同时保留问题标题和描述的语义。

<demo react="shadcn-base/questionnaire-card.tsx" />

## 对话框 {#dialog}

在 Dialog 中组合使用 Questionnaire，由外层处理取消和关闭。

<demo react="shadcn-base/questionnaire-dialog.tsx" />

## 无障碍 {#accessibility}

`QuestionnaireItem` 渲染 `fieldset`，`QuestionnaireTitle` 渲染对应的
`legend`。描述和当前错误与当前题目关联，
无效的题目和答题控件会公开 `aria-invalid`。

预设选项保留原生单选框和复选框行为。进度通过具名的
进度条公开，导航使用实际按钮，未激活的题目和操作会隐藏并禁用交互。
导航成功后，焦点移到新激活的题目。
验证失败时，焦点移到一个可用的答题控件。

务必通过可见标签、`aria-label` 或 `aria-labelledby` 为 `QuestionnaireInput`
提供无障碍名称。占位文本无法充当标签。有关自定义组合的标签设置及完整键盘行为，
请参阅 [Questionnaire 无障碍指南](https://ui.shadcn.com/docs/react/questionnaire#accessibility)
中的说明。

## 无样式 {#unstyled}

`Questionnaire` 的行为来自 `@shadcn/react` 包。如需直接搭配
自己的标记和样式使用，请参阅 @shadcn/react 下的
[Questionnaire](https://ui.shadcn.com/docs/react/questionnaire)。

## API 参考 {#api-reference}

每个部件的属性、数据属性和渲染状态均记录在
[@shadcn/react Questionnaire](https://ui.shadcn.com/docs/react/questionnaire#api-reference) 页面。
有样式的组件继承对应无样式组件的属性。导航组件
还接受 Button 的 `size` 和 `variant` 属性，
`QuestionnaireActions` 是有样式版本专用的布局组件。
