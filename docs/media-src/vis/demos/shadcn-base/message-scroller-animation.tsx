"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  ArrowUpIcon,
  MessageCircleDashedIcon,
  RotateCwIcon,
} from "lucide-react"

import { createChat } from "@/lib/ai"
import {
  MESSAGE_ANIMATIONS,
  type MessageAnimationId,
} from "@/lib/message-animations"
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-rhea/ui/select"

const chat = createChat()
  .user("用户消息能像 iMessage 一样弹出，同时不影响锚点吗？")
  .sleep(1000)
  .assistant(
    "可以。通过 transform 和 opacity 为用户消息行添加动画，同时让助手回复继续在下方正常流式显示。\n\n这样消息行的尺寸仍然稳定，新发送的气泡也能获得更自然的入场效果。"
  )
  .user("怎样让动画更接近 iMessage 的感觉？")
  .sleep(1000)
  .assistant(
    "从消息尾部快速弹入，并加入轻微缩放和上移，不要使用布局动画。\n\n气泡会显得更灵动，同时消息行的尺寸保持稳定，锚点和自动滚动也不会受到布局变化影响。"
  )
  .user("我可以在同一段对话中切换预设进行测试吗？")
  .sleep(1000)
  .assistant(
    "可以。切换预设时保留当前对话，再发送下一条消息，就能在相同上下文中比较不同的入场效果。\n\n这样无需每次重建场景，就能轻松比较淡入、快速弹出和更明显的 3D 倾斜效果。"
  )

const initialMessages = chat.get(0)
const transport = chat.transport({ delayMs: 15 })

export function MessageScrollerAnimation() {
  const { messages, sendMessage, setMessages, status } = useChat({
    messages: initialMessages,
    transport,
  })
  const [presetId, setPresetId] = React.useState<MessageAnimationId>("fade")
  const nextMessage = chat.next(messages)
  const isBusy = status === "submitted" || status === "streaming"
  const preset = MESSAGE_ANIMATIONS[presetId as MessageAnimationId]

  return (
    <div className="relative flex flex-col gap-4">
      <Card className="mx-auto h-140 w-full max-w-sm gap-0">
        <CardHeader className="border-b">
          <CardTitle>动画</CardTitle>
          <CardDescription>
            选择用户消息加入对话时的动画效果。
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="重置动画消息"
              disabled={messages.length === 0 || isBusy}
              onClick={() => setMessages(initialMessages)}
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
                <EmptyTitle>暂无消息</EmptyTitle>
                <EmptyDescription>
                  点击下方按钮发送第一条消息。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MessageScrollerProvider>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    aria-busy={isBusy}
                    className="p-(--card-spacing)"
                  >
                    {messages.map((message) => (
                      <MessageAnimated
                        key={message.id}
                        message={message}
                        animationPreset={preset}
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
        <CardFooter className="border-t">
          <Select
            value={presetId}
            onValueChange={(value) => {
              setPresetId(value as MessageAnimationId)
            }}
          >
            <SelectTrigger aria-label="动画预设">
              <SelectValue>{preset.name}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="top">
              <SelectGroup>
                {Object.values(MESSAGE_ANIMATIONS).map((animation) => (
                  <SelectItem key={animation.id} value={animation.id}>
                    {animation.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            className="ml-auto"
            disabled={!nextMessage || isBusy}
            onClick={() => {
              if (!nextMessage || isBusy) {
                return
              }

              void sendMessage(nextMessage)
            }}
          >
            <ArrowUpIcon />
            <span className="sr-only">发送消息</span>
          </Button>
        </CardFooter>
      </Card>
      <div className="mx-auto max-w-sm px-0.5 text-center text-xs text-balance text-muted-foreground">
        选择一种动画并点击“发送”查看效果。
      </div>
    </div>
  )
}
