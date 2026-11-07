"use client"

import { useChat } from "@ai-sdk/react"
import {
  ArrowUpIcon,
  GlobeIcon,
  ImageIcon,
  MessageCircleDashedIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCwIcon,
  TelescopeIcon,
} from "lucide-react"

import { createChat, getMessageText } from "@/lib/ai"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/styles/base-rhea/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-rhea/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@/styles/base-rhea/ui/input-group"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/styles/base-rhea/ui/message-scroller"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-rhea/ui/tooltip"

const chat = createChat()
  .user(
    "我正在给应用做聊天界面，滚动行为快把我逼疯了。AI 每次流式回复，整个对话就会跳来跳去。"
  )
  .sleep(1000)
  .assistant(
    "这是典型的流式滚动问题。用 `MessageScroller` 包住消息列表并启用 `autoScroll`，新文本到达时视口会固定在底部，用户始终能看到最新内容。\n\n关键在于：只有读者已经位于底部时才会自动滚动。一旦向上滚动阅读之前的内容，自动滚动就会暂停并保留当前位置。这样既能流畅显示消息，也不会打断用户的操作。"
  )
  .user(
    "不过，发送新消息时视图还是会突然跳动，感觉像整段对话都从头加载了一遍。"
  )
  .sleep(1000)
  .assistant(
    "`MessageScrollerItem` 可以通过轮次锚点解决这个问题。给需要停留在顶部附近的轮次设置 `scrollAnchor`，不用再一味地跳到文档底部。\n\n锚点上方还会保留一小段上一轮对话，方便查看上下文。回复会直接出现在视野中，不会像普通溢出容器那样突然跳动。"
  )
  .user(
    "如果用户向上滚动重读之前的回答呢？我不想再把他们拽回底部。"
  )
  .sleep(1000)
  .assistant(
    "不会。只有视口已经固定在底部时才会自动滚动，所以用户向上滚动后就会暂停自动滚动；即使下方不断收到新内容，阅读位置也会保持不变。\n\n有尚未读到的新内容时，视口底部会出现 `MessageScrollerButton`。点击后即可跳到最新消息并恢复自动滚动。这与 Slack 或 iMessage 的行为相同：读到最新内容时保持安静，有新内容时提供帮助。"
  )
  .user("最后一个问题：它支持辅助技术吗？")
  .sleep(1000)
  .assistant(
    "`MessageScrollerContent` 默认设置 `role=\"log\"` 和 `aria-relevant=\"additions\"`，因此屏幕阅读器会在新消息流入时播报内容。\n\n滚动按钮是带有仅屏幕阅读器可见标签的真实 `<button>`。当视口已位于底部时，按钮会从 Tab 键顺序中移除，不会产生无效的焦点停留。"
  )
const initialMessages = chat.get(0)
const transport = chat.transport({ delayMs: 20 })

export function MessageScrollerDemo() {
  const { messages, sendMessage, status, setMessages } = useChat({
    messages: initialMessages,
    transport,
  })
  const nextMessage = chat.next(messages)
  const isBusy = status === "submitted" || status === "streaming"

  return (
    <MessageScrollerProvider>
      <div className="relative flex flex-col gap-4">
        <Card className="mx-auto h-140 w-full max-w-sm gap-0">
          <CardHeader className="gap-1 border-b">
            <CardTitle>新建对话</CardTitle>
            <CardDescription>今天有什么可以帮你？</CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="重置对话"
                      onClick={() => setMessages(initialMessages)}
                      disabled={isBusy}
                    />
                  }
                >
                  <RotateCwIcon />
                </TooltipTrigger>
                <TooltipContent>
                  <p>重置</p>
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {messages.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashedIcon />
                  </EmptyMedia>
                  <EmptyTitle>早上好，shadcn！</EmptyTitle>
                  <EmptyDescription>
                    今天要处理什么？点击“发送”开始新对话。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
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
                        scrollAnchor={message.role === "user"}
                      />
                    ))}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!nextMessage || isBusy) {
                  return
                }
                void sendMessage(nextMessage)
              }}
              className="w-full"
            >
              <InputGroup>
                <div className="h-14 w-full px-3 py-2.5">
                  <span
                    className="line-clamp-2 opacity-60 data-[status=ready]:opacity-100"
                    data-status={status}
                  >
                    {nextMessage ? (
                      getMessageText(nextMessage)
                    ) : (
                      <span className="text-muted-foreground">
                        没有待发送的消息。重置对话。
                      </span>
                    )}
                  </span>
                </div>
                <InputGroupAddon align="block-end" className="pt-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          aria-label="添加文件"
                          type="button"
                          size="icon-sm"
                          variant="outline"
                        />
                      }
                    >
                      <PlusIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="top"
                      className="w-44"
                    >
                      <DropdownMenuItem>
                        <PaperclipIcon />
                        添加图片和文件
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <ImageIcon />
                        创建图像
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <TelescopeIcon />
                        深度研究
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <GlobeIcon />
                        网页搜索
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={!nextMessage || isBusy}
                    className="ml-auto"
                  >
                    <ArrowUpIcon />
                    <span className="sr-only">发送</span>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </CardFooter>
        </Card>
        <div className="px-0.5 text-center text-xs text-muted-foreground">
          此演示为只读模式。点击“发送”以发送消息。
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
