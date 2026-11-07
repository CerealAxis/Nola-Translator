import { useState, type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  AuiConfig,
  InMemoryThreadListAdapter,
  SimpleImageAttachmentAdapter,
  Suggestions,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'

const replies = [
  '可以。先明确要完成的任务，再列出两到三个可操作的步骤。\n\n',
  '例如，整理一份会议纪要时，可以先写结论，再列出待办事项和负责人。\n\n',
  '最后检查遗漏的时间和人名，就可以分享给团队了。',
]

const demoModel: ChatModelAdapter = {
  async *run({ abortSignal }) {
    let text = ''
    for (const paragraph of replies) {
      await new Promise(resolve => setTimeout(resolve, 550))
      abortSignal.throwIfAborted()
      text += paragraph
      yield { content: [{ type: 'text', text }] }
    }
  },
}

const adapters = { attachments: new SimpleImageAttachmentAdapter() }
const config = AuiConfig({
  suggestions: Suggestions(['帮我整理一份会议纪要', '给我一份行动清单']),
})

export function DemoRuntime({
  children,
  messages,
}: {
  children: ReactNode
  messages?: readonly ThreadMessageLike[]
}) {
  const runtime = useLocalRuntime(demoModel, { initialMessages: messages, adapters })
  return <AssistantRuntimeProvider runtime={runtime} config={config}>{children}</AssistantRuntimeProvider>
}

function useDemoThreadRuntime() {
  return useLocalRuntime(demoModel, { adapters })
}

export function DemoThreadListRuntime({ children }: { children: ReactNode }) {
  const [adapter] = useState(() => {
    const store = new InMemoryThreadListAdapter()
    for (const [id, title] of [
      ['notes', '会议纪要'],
      ['translation', '术语翻译'],
      ['review', '译文校对'],
    ]) {
      void store.initialize(id)
      void store.rename(id, title)
    }
    return store
  })
  const runtime = useRemoteThreadListRuntime({ adapter, runtimeHook: useDemoThreadRuntime })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
