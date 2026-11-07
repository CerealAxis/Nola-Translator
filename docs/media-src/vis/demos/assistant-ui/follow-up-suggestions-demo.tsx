import { useState } from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import { ThreadFollowupSuggestions } from '../../assistant-ui/elements/follow-up-suggestions.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const suggestions = [
  { title: '整理待办', label: '按负责人分组', prompt: '请把会议内容按负责人整理成待办事项。' },
  { title: '概括结论', prompt: '用三句话概括会议结论。' },
  { title: '准备邮件', prompt: '把会议结论写成一封邮件。' },
]

function SuggestionsDemo() {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([
    { role: 'assistant', content: '会议纪要已整理完成。你可以选择接下来要做的事。' },
  ])
  const runtime = useExternalStoreRuntime({
    messages,
    suggestions,
    convertMessage: message => message,
    onNew: async ({ content }) => setMessages(current => [...current, { role: 'user', content }]),
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        {messages.map((message, index) => (
          <p key={index} className="text-sm">{typeof message.content === 'string' ? message.content : message.content.map(part => part.type === 'text' ? part.text : '').join('')}</p>
        ))}
        <ThreadFollowupSuggestions />
      </div>
    </AssistantRuntimeProvider>
  )
}

export default function Demo() {
  return <AssistantPreview><SuggestionsDemo /></AssistantPreview>
}
