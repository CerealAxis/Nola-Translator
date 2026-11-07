"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  MessageCircleDashedIcon,
  RotateCwIcon,
} from "lucide-react"

import { MessageAnimated } from "@/components/message-animated"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-rhea/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-rhea/ui/empty"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/styles/base-rhea/ui/message-scroller"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-rhea/ui/toggle-group"

type AnchorRole = "user" | "assistant"

type ChatMessage = {
  id: string
  role: AnchorRole
  text: string
}

const scriptedMessages: ChatMessage[] = [
  {
    id: "anchor-1-user",
    role: "user",
    text: "能演示新提示开始一轮对话时锚定效果如何吗？",
  },
  {
    id: "anchor-1-assistant",
    role: "assistant",
    text: "先追加用户提示，再追加助手回复。选择“用户”后，提示会停留在靠上位置，助手回复显示在下方。",
  },
  {
    id: "anchor-2-user",
    role: "user",
    text: "将助手消息设为锚点后会有什么变化？",
  },
  {
    id: "anchor-2-assistant",
    role: "assistant",
    text: "现在 MessageScroller 会将每条助手回复保持在视野中，适合希望读者每轮都聚焦回复内容的场景。",
  },
  {
    id: "anchor-3-user",
    role: "user",
    text: "我可以切换角色并继续添加对话轮次吗？",
  },
  {
    id: "anchor-3-assistant",
    role: "assistant",
    text: "可以。下一个追加的所选角色消息会成为锚点，因此你可以比较用户与助手的锚定效果，无需重置演示。",
  },
]

export function MessageScrollerAnchoring() {
  const [anchorRole, setAnchorRole] = React.useState<AnchorRole>("user")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [messageIndex, setMessageIndex] = React.useState(0)
  const nextMessage = scriptedMessages[messageIndex]

  return (
    <div className="relative flex flex-col gap-4">
      <Card className="mx-auto h-140 w-full max-w-sm gap-0">
        <CardHeader className="border-b">
          <CardTitle>锚定消息</CardTitle>
          <CardDescription>
            选择停留在顶部附近的消息角色。
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="重置锚定消息"
              disabled={messages.length === 0}
              onClick={() => {
                setMessages([])
                setMessageIndex(0)
              }}
            >
              <RotateCwIcon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          {messages.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleDashedIcon />
                </EmptyMedia>
                <EmptyTitle>还没有锚定的消息</EmptyTitle>
                <EmptyDescription>
                  发送第一条消息，查看所选角色的锚定效果。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MessageScrollerProvider>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-(--card-spacing)">
                    {messages.map((message) => (
                      <MessageAnimated
                        key={message.id}
                        message={message}
                        scrollAnchor={message.role === anchorRole}
                        userVariant="muted"
                        assistantVariant="ghost"
                      />
                    ))}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          )}
        </CardContent>
        <CardFooter>
          <ToggleGroup
            aria-label="选择滚动锚点角色"
            value={[anchorRole]}
            onValueChange={(value) => {
              const nextValue = value[0]

              if (nextValue === "user" || nextValue === "assistant") {
                setAnchorRole(nextValue)
                setMessages([])
                setMessageIndex(0)
              }
            }}
          >
            <ToggleGroupItem value="user" aria-label="锚定用户消息">
              用户
            </ToggleGroupItem>
            <ToggleGroupItem
              value="assistant"
              aria-label="锚定助手消息"
            >
              助手
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            size="icon"
            className="ml-auto"
            disabled={!nextMessage}
            onClick={() => {
              if (!nextMessage) {
                return
              }

              setMessages((messages) => [...messages, nextMessage])
              setMessageIndex((index) => index + 1)
            }}
          >
            <ArrowUpIcon />
            <span className="sr-only">发送消息</span>
          </Button>
        </CardFooter>
      </Card>
      <div className="mx-auto max-w-xs px-0.5 text-center text-xs text-muted-foreground">
        切换锚定角色并发送消息，比较各轮对话的停留位置。
      </div>
    </div>
  )
}
