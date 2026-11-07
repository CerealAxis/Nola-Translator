"use client"

import * as React from "react"

import { createChat, getMessageText } from "@/lib/ai"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/styles/base-rhea/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/styles/base-rhea/ui/dropdown-menu"
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

const chat = createChat()
  .user(
    "工作区创建完成后的激活率有所下降。能帮我找出可能的问题环节吗？",
    { id: "command-activation" }
  )
  .assistant(
    "下降最明显的环节，是创建工作区之后、邀请第一位队友之前。\n\n工作区创建环节表现正常，但用户会在邀请队友时停下来。这说明产品可能在用户还不熟悉工作区时，就要求他们开始协作。"
  )
  .user("调整引导流程前，我应该比较哪些数据？", {
    id: "command-compare",
  })
  .assistant(
    "比较这三组用户：\n\n1. 邀请队友前先选择模板的用户。\n2. 从空白工作区开始的用户。\n3. 跳过邀请并在 24 小时内返回的用户。\n\n如果选择模板的用户更快发出邀请，改进首次使用引导可能比强化邀请提示更有效。"
  )
  .user("能把这些转成一个实验方案吗？", {
    id: "command-experiment",
  })
  .assistant(
    "可以。创建一个变体，在工作区创建完成后显示简短清单：\n\n- 选择一个模板。\n- 补充一项项目信息。\n- 工作区信息完善后再邀请队友。\n\n衡量首次邀请完成率、24 小时回访率，以及团队是否创建了第二个项目。"
  )
  .user("延后显示邀请提示有什么风险？", {
    id: "command-risk",
  })
  .assistant(
    "主要风险是：已经明确邀请对象的账号可能会减少团队创建。\n\n为了保留这条路径，可以让邀请操作继续显示在页眉中，只调整空状态下的主要引导。这样熟悉流程的团队仍可直接邀请，而不确定的用户也不会过早被要求邀请队友。"
  )

const messages = chat.get()
const userMessages = messages.filter((message) => message.role === "user")

export function MessageScrollerCommands() {
  return (
    <MessageScrollerProvider defaultScrollPosition="end">
      <div className="relative flex flex-col gap-4">
        <Card className="mx-auto h-140 w-full max-w-sm gap-0">
          <CardHeader className="gap-1 border-b">
            <CardTitle>命令</CardTitle>
            <CardDescription>
              从外部控制转录内容。
            </CardDescription>
            <CardAction>
              <CommandMenu />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="p-(--card-spacing)">
                  {messages.map((message) => {
                    const isUserMessage = message.role === "user"
                    const text = getMessageText(message)

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
                                {text
                                  .split(/\n\s*\n/)
                                  .map((paragraph) => paragraph.trim())
                                  .filter(Boolean)
                                  .map((paragraph, index) => (
                                    <p
                                      key={index}
                                      className="whitespace-pre-wrap"
                                    >
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
          </CardContent>
        </Card>
        <div className="mx-auto max-w-sm px-0.5 text-center text-xs text-balance text-muted-foreground">
          使用控件跳转到对话中的任意消息。
        </div>
      </div>
    </MessageScrollerProvider>
  )
}

function CommandMenu() {
  const { scrollToMessage } = useMessageScroller()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="secondary" />}
      >
        跳转到...
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>对话</DropdownMenuLabel>
          {userMessages.map((message) => (
            <DropdownMenuItem
              key={message.id}
              onClick={() =>
                scrollToMessage(message.id, {
                  align: "start",
                  behavior: "smooth",
                })
              }
            >
              <span className="line-clamp-1 min-w-0">
                {getTrimmedMessageText(message)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getTrimmedMessageText(message: (typeof userMessages)[number]) {
  const text = getMessageText(message)

  return text.length > 42 ? `${text.slice(0, 39)}...` : text
}
