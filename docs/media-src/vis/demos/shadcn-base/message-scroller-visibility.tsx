"use client"

import { createChat, getMessageText } from "@/lib/ai"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/styles/base-rhea/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/styles/base-rhea/ui/hover-card"
import { Message, MessageContent } from "@/styles/base-rhea/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/styles/base-rhea/ui/message-scroller"

const chat = createChat()
  .user("查看事件交接记录，告诉我应该先读哪些内容。", {
    id: "vis-brief",
  })
  .assistant(
    "先看摘要和影响范围。回归问题影响了上传队列，但所有排队任务都已通过恢复流程完成处理。"
  )
  .user("对用户造成了什么影响？", {
    id: "vis-impact",
  })
  .assistant(
    "影响仅限于处理延迟。\n\n没有记录丢失，对账工作进程已确认每批重试均成功处理。两位客户对此产生疑问，但结账和账单流程没有错误。"
  )
  .user("还有哪些待办事项？", {
    id: "vis-actions",
  })
  .assistant(
    "在下一次部署前保持重试窗口启用，之后添加队列深度告警作为长期修复方案。\n\n告警应在队列持续增长时触发，而不是因短暂的单次峰值触发。"
  )
  .user("给我一份后续检查清单。", {
    id: "vis-checklist",
  })
  .assistant(
    "之后，将队列恢复曲线与部署时间线对照，明确记录处理何时恢复到基线。这样支持和工程团队无需重读整条事件记录，也能一致地回答客户问题。\n\n我还会在每项后续工作旁标注负责人。清单虽然不长，但明确责任人可以避免重试窗口决策、告警调整和支持回复模板分散到不同的跟进对话中。\n\n在下一次部署前保持重试窗口启用，之后添加队列深度告警作为长期修复方案。\n\n告警应在队列持续增长时触发，而不是因短暂的单次峰值触发。"
  )

const messages = chat.get()
const userMessages = messages.filter((message) => message.role === "user")

export function MessageScrollerVisibility() {
  return (
    <MessageScrollerProvider scrollMargin={12}>
      <div className="relative flex flex-col gap-4">
        <div className="relative mx-auto w-full max-w-sm">
          <Card className="h-140 w-full gap-0">
            <CardHeader className="gap-1 border-b">
              <CardTitle>转录提纲</CardTitle>
              <CardDescription>
                跟踪当前锚定的对话轮次。
              </CardDescription>
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
                              <Bubble
                                variant={isUserMessage ? "muted" : "ghost"}
                              >
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
          <div className="absolute top-1/2 -right-12 -translate-y-1/2">
            <TranscriptOutline />
          </div>
        </div>
        <div className="mx-auto max-w-sm px-0.5 text-center text-xs text-muted-foreground">
          打开提纲，在阅读时跳转到已锚定的对话轮次。
        </div>
      </div>
    </MessageScrollerProvider>
  )
}

function TranscriptOutline() {
  const { scrollToMessage } = useMessageScroller()
  const { currentAnchorId } = useMessageScrollerVisibility()

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label="打开转录提纲"
            className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        {userMessages.map((message) => (
          <span
            key={message.id}
            data-current={message.id === currentAnchorId}
            className="h-0.5 w-4 rounded-full bg-muted-foreground/40 data-[current=true]:bg-foreground"
          />
        ))}
      </HoverCardTrigger>
      <HoverCardContent
        align="center"
        side="left"
        sideOffset={-28}
        className="flex w-64 flex-col gap-1 rounded-2xl p-1"
      >
        {userMessages.map((message) => (
          <button
            key={message.id}
            type="button"
            aria-current={
              currentAnchorId === message.id ? "location" : undefined
            }
            className="flex min-h-7 items-center rounded-xl px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground aria-current:bg-accent aria-current:text-accent-foreground"
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
          </button>
        ))}
      </HoverCardContent>
    </HoverCard>
  )
}

function getTrimmedMessageText(message: (typeof userMessages)[number]) {
  const text = getMessageText(message)

  return text.length > 42 ? `${text.slice(0, 39)}...` : text
}
