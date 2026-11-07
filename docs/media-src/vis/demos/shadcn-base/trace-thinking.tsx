"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import { BrainIcon } from "lucide-react"

import { createChat, getMessageText } from "@/lib/ai"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import { Message, MessageContent } from "@/styles/base-rhea/ui/message"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

const chat = createChat()
  .user("为什么结账服务的部署这么慢？")
  .assistant(({ writer }) => {
    writer.reasoning(
      "构建日志显示安装和编译不到一分钟就完成了。图像优化耗时近四分钟，而且每次部署都会重新运行，因为缓存键包含了提交哈希。",
      { delayMs: 60 }
    )
    writer.sleep(400)
    writer.text(
      "瓶颈在图像优化。将缓存键改为依赖锁文件和图像目录，而不是提交哈希。"
    )
  })

const initialMessages = chat.get(0)
const transport = chat.transport({ delayMs: 20 })

function ThinkingTrace({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = React.useState<boolean>()

  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        <BrainIcon />
      </TraceIcon>
      <TraceTitle>{running ? "正在思考" : "思考完毕"}</TraceTitle>
    </TraceLine>
  )

  if (text.length === 0) {
    return line
  }

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function groupParts(parts: UIMessage["parts"]) {
  const runs: { trace: boolean; parts: UIMessage["parts"] }[] = []

  for (const part of parts) {
    const trace = part.type === "reasoning"

    if (!trace && part.type !== "text") {
      continue
    }

    const last = runs.at(-1)

    if (last?.trace === trace) {
      last.parts.push(part)
    } else {
      runs.push({ trace, parts: [part] })
    }
  }

  return runs
}

export function TraceThinking() {
  const { messages, sendMessage, setMessages, status } = useChat({
    messages: initialMessages,
    transport,
  })
  const nextMessage = chat.next(messages)
  const busy = status === "submitted" || status === "streaming"

  return (
    <div className="flex min-h-72 w-full max-w-sm flex-col gap-4 py-6 text-sm">
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <Message key={message.id} align="end">
              <MessageContent>
                <Bubble align="end" variant="muted">
                  <BubbleContent>{getMessageText(message)}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          )
        }

        const live = status === "streaming" && message === messages.at(-1)

        return (
          <Message key={message.id}>
            <MessageContent className="gap-4">
              {groupParts(message.parts).map((run, runIndex) =>
                run.trace ? (
                  <Trace key={runIndex}>
                    {run.parts.map((part, index) =>
                      part.type === "reasoning" ? (
                        <ThinkingTrace
                          key={index}
                          text={part.text}
                          running={live && part.state === "streaming"}
                        />
                      ) : null
                    )}
                  </Trace>
                ) : (
                  run.parts.map((part, index) =>
                    part.type === "text" ? (
                      <p key={`${runIndex}-${index}`}>{part.text}</p>
                    ) : null
                  )
                )
              )}
            </MessageContent>
          </Message>
        )
      })}
      {!busy && (
        <Button
          variant="outline"
          size="sm"
          className="mt-auto self-start"
          onClick={() =>
            nextMessage
              ? sendMessage(nextMessage)
              : setMessages(initialMessages)
          }
        >
          {nextMessage ? "发送消息" : "重置"}
        </Button>
      )}
    </div>
  )
}
