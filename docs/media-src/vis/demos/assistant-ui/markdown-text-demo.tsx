import { MessagePrimitive, ThreadPrimitive, type ThreadMessageLike } from '@assistant-ui/react'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { MarkdownText } from '../../assistant-ui/elements/markdown-text'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const messages: ThreadMessageLike[] = [{
  role: 'assistant',
  content: [
    '## 译文校对清单',
    '',
    '先核对术语，再检查格式。可使用 **粗体**、`行内代码`和[参考链接](https://www.assistant-ui.com/)。',
    '',
    '| 检查项 | 状态 |',
    '| --- | --- |',
    '| 人名与地名 | 已完成 |',
    '| 数字与单位 | 待核对 |',
    '',
    '- [x] 对照术语表',
    '- [ ] 检查标点',
    '',
    '> 完成后再通读一遍译文。',
    '',
    '```ts',
    'const status = "校对完成"',
    '```',
  ].join('\n'),
}]

export default function MarkdownTextDemo() {
  return (
    <AssistantPreview>
      <DemoRuntime messages={messages}>
        <ThreadPrimitive.Root className="mx-auto w-full max-w-xl">
          <ThreadPrimitive.Messages>
            {() => (
              <MessagePrimitive.Root dir="auto">
                <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
              </MessagePrimitive.Root>
            )}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Root>
      </DemoRuntime>
    </AssistantPreview>
  )
}
