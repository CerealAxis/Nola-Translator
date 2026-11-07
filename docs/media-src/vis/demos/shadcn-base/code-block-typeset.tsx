"use client"

import { FileCodeIcon } from "lucide-react"

import { useHighlightedCode } from "@/registry/bases/base/hooks/use-highlighted-code"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/styles/base-rhea/ui/code-block"

const code = `import { streamText } from "ai"

export async function POST(request: Request) {
  const { messages } = await request.json()
  const result = streamText({ model: "anthropic/claude-sonnet-4.5", messages })

  return result.toUIMessageStreamResponse()
}`

export function CodeBlockTypeset() {
  const lines = useHighlightedCode(code, "ts")

  return (
    <div className="typeset w-full max-w-md">
      <h3>流式响应</h3>
      <p>
        创建一个调用 <code>streamText</code> 并将数据流返回给客户端的路由处理程序。
      </p>
      <CodeBlock>
        <CodeBlockHeader>
          <CodeBlockTitle>
            <FileCodeIcon />
            app/api/chat/route.ts
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton value={code} />
          </CodeBlockActions>
        </CodeBlockHeader>
        <CodeBlockContent lineNumbers>
          {lines.map((line, index) => (
            <CodeBlockLine key={index}>{line}</CodeBlockLine>
          ))}
        </CodeBlockContent>
      </CodeBlock>
      <p>
        这个 <code>useChat</code>  Hook 会在客户端读取数据流，并在生成答案时同步渲染。
      </p>
    </div>
  )
}
