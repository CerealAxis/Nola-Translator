"use client"

import * as React from "react"

import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-rhea/ui/card"
import { Message, MessageContent } from "@/styles/base-rhea/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/styles/base-rhea/ui/message-scroller"
import { Tabs, TabsList, TabsTrigger } from "@/styles/base-rhea/ui/tabs"

const messages = [
  {
    id: "open-1",
    role: "user",
    text: "这是用户在对话中发送的第一条消息。",
  },
  {
    id: "open-2",
    role: "assistant",
    text: "工作区创建量增长了 8%，但首次邀请完成率仅增长了 2%。",
  },
  {
    id: "open-3",
    role: "user",
    text: "这是用户在对话中发送的最后一条消息。",
  },
  {
    id: "open-4",
    role: "assistant",
    text: "从邀请步骤入手。团队会创建工作区，但迟迟没有添加协作者。\n\n建议后续检查：\n\n1. 按账户规模比较邀请流程的流失情况。\n2. 检查跳过邀请的用户是否仍会在 24 小时内回来。\n3. 查看首个项目页面的空状态文案。\n4. 按模板细分激活情况，因为使用模板的用户可能暂时不需要邀请协作者。\n\n如果这一趋势成立，下一轮实验应让协作更早体现价值，而不是反复催促用户发送邀请。",
  },
] satisfies Array<{
  id: string
  role: "user" | "assistant"
  text: string
}>

const positions = [
  { value: "start", label: "start" },
  { value: "end", label: "end" },
  { value: "last-anchor", label: "last-anchor" },
] satisfies Array<{
  value: "start" | "end" | "last-anchor"
  label: string
}>

export function MessageScrollerOpeningPosition() {
  const [positionKey, setPositionKey] = React.useState(0)
  const [position, setPosition] = React.useState<
    "start" | "end" | "last-anchor"
  >("last-anchor")

  return (
    <div className="relative flex flex-col gap-4">
      <Card className="mx-auto h-140 w-full max-w-sm gap-0">
        <CardHeader className="gap-1 border-b">
          <CardTitle>打开位置</CardTitle>
          <CardDescription>
            选择已保存转录的打开位置。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <MessageScrollerProvider>
            <OpeningPositionScroller
              position={position}
              positionKey={positionKey}
            />
          </MessageScrollerProvider>
        </CardContent>
        <CardFooter className="flex items-center justify-center border-t">
          <Tabs
            value={position}
            onValueChange={(value) => {
              if (
                value === "start" ||
                value === "end" ||
                value === "last-anchor"
              ) {
                setPosition(value)
                setPositionKey((key) => key + 1)
              }
            }}
            className="w-full"
          >
            <TabsList className="w-full">
              {positions.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardFooter>
      </Card>
      <div className="mx-auto max-w-sm px-0.5 text-center text-xs text-muted-foreground">
        切换 defaultScrollPosition，查看打开对话时转录内容的起始位置。
      </div>
    </div>
  )
}

function OpeningPositionScroller({
  position,
  positionKey,
}: {
  position: "start" | "end" | "last-anchor"
  positionKey: number
}) {
  const { scrollToEnd, scrollToMessage, scrollToStart } = useMessageScroller()

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (position === "start") {
        scrollToStart({ behavior: "auto" })
        return
      }

      if (position === "end") {
        scrollToEnd({ behavior: "auto" })
        return
      }

      scrollToMessage("open-3", {
        align: "start",
        behavior: "auto",
        scrollMargin: 64,
      })
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [position, positionKey, scrollToEnd, scrollToMessage, scrollToStart])

  return (
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent className="p-(--card-spacing)">
          {messages.map((message) => {
            const isUserMessage = message.role === "user"

            return (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={isUserMessage}
              >
                <Message align={isUserMessage ? "end" : "start"}>
                  <MessageContent>
                    <Bubble variant={isUserMessage ? "muted" : "ghost"}>
                      <BubbleContent className="space-y-2">
                        {message.text
                          .split(/\n\s*\n/)
                          .map((paragraph) => paragraph.trim())
                          .filter(Boolean)
                          .map((paragraph, index) => (
                            <p key={index} className="whitespace-pre-wrap">
                              {paragraph}
                            </p>
                          ))}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            )
          })}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  )
}
