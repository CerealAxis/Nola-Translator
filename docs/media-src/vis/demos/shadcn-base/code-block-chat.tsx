"use client"

import { useHighlightedCode } from "@/registry/bases/base/hooks/use-highlighted-code"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/styles/base-rhea/ui/code-block"
import { Message, MessageContent } from "@/styles/base-rhea/ui/message"

const code = `import { streamText } from "ai"

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: "anthropic/claude-sonnet-4.5",
    messages,
  })

  return result.toUIMessageStreamResponse()
}`

export function CodeBlockChat() {
  const lines = useHighlightedCode(code, "ts")

  return (
    <div className="flex w-full max-w-md flex-col gap-4 text-sm">
      <Message align="end">
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent>如何流式接收响应？</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message>
        <MessageContent className="gap-3">
          <p>创建一个返回数据流的路由处理程序：</p>
          <CodeBlock>
            <CodeBlockHeader>
              <CodeBlockTitle>app/api/chat/route.ts</CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton value={code} />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent>
              {lines.map((line, index) => (
                <CodeBlockLine key={index}>{line}</CodeBlockLine>
              ))}
            </CodeBlockContent>
          </CodeBlock>
          <p>客户端使用 useChat 读取响应。</p>
        </MessageContent>
      </Message>
    </div>
  )
}
