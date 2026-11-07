"use client"

import * as React from "react"
import { RotateCwIcon } from "lucide-react"
import { toast } from "sonner"

import { createChat, getMessageText } from "@/lib/ai"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
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
import { Marker, MarkerContent } from "@/styles/base-rhea/ui/marker"
import { Message, MessageContent } from "@/styles/base-rhea/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/styles/base-rhea/ui/message-scroller"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-rhea/ui/tooltip"

const chat = createChat()
  .user("能总结一下事件频道的内容吗？")
  .assistant(
    "第一次告警由导出任务延迟触发。任务约在 09:42 UTC 开始积压，重试队列超过阈值后系统发出了警告。\n\n面向用户的结账流程没有受到影响，但较大工作区的导出延迟了约 12 分钟。"
  )
  .user("结账流程受到影响了吗？")
  .assistant(
    "没有发现结账错误。支付授权、订单创建和确认邮件的延迟都在正常范围内。\n\n只有导出队列深度指标升高了；它影响的是分析数据下载，而非结账流程。"
  )
  .user("最近一次部署改了什么？")
  .assistant(
    "这次只改动了导出队列工作进程。部署将大型 CSV 任务切换到共享重试策略，导致每次失败重试占用工作进程的时间变长。\n\n应用部署没有改动结账、定价或账单 API。"
  )
  .user("需要回滚吗？")
  .assistant(
    "暂时不用。降低重试并发后，队列积压正在缓解；最早的待处理任务目前等待时间不到五分钟。\n\n如果队列再次增长，请准备回滚；目前的趋势显示系统正在恢复。"
  )
  .user("继续关注用户可见的问题。")
  .assistant(
    "我会再观察队列和支持标签 15 分钟，重点关注导出失败、下载延迟，以及提到报告缺失的支持请求。\n\n如果下一个批处理时段没有新问题，就可以将其作为内部服务降级事件关闭。"
  )

const history = chat.get()
const INITIAL_VISIBLE_COUNT = 5

export function MessageScrollerLoadHistory() {
  const [demoKey, setDemoKey] = React.useState(0)
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_VISIBLE_COUNT)
  const visibleMessages = history.slice(-visibleCount)
  const canLoadHistory = visibleCount < history.length

  return (
    <MessageScrollerProvider>
      <div className="relative flex flex-col gap-4">
        <Card className="mx-auto h-140 w-full max-w-sm gap-0">
          <CardHeader className="gap-1 border-b">
            <CardTitle>加载历史记录</CardTitle>
            <CardDescription>
              前置消息不会改变你当前的位置。
            </CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="重置已加载的消息"
                      disabled={visibleCount === INITIAL_VISIBLE_COUNT}
                      onClick={() => {
                        setVisibleCount(INITIAL_VISIBLE_COUNT)
                        setDemoKey((key) => key + 1)
                      }}
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
            <MessageScroller key={demoKey}>
              <MessageScrollerViewport>
                <MessageScrollerContent className="p-(--card-spacing)">
                  {visibleMessages.map((message) => {
                    const isUserMessage = message.role === "user"

                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                      >
                        <Message align={isUserMessage ? "end" : "start"}>
                          <MessageContent>
                            <Bubble variant={isUserMessage ? "muted" : "ghost"}>
                              <BubbleContent className="space-y-2">
                                {getMessageText(message)
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
                  <MessageScrollerItem scrollAnchor={false}>
                    <Marker variant="separator">
                      <MarkerContent>对话结束</MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </CardContent>
          <CardFooter className="flex flex-col items-center gap-2 border-t">
            <Button
              type="button"
              disabled={!canLoadHistory}
              onClick={() => {
                setVisibleCount(history.length)
                toast("历史记录已加载", {
                  description: "向上滚动以查看更早的消息。",
                })
              }}
              className="w-full"
              variant="secondary"
            >
              {canLoadHistory ? "加载历史记录" : "历史记录已加载"}
            </Button>
            <p className="text-xs text-muted-foreground">
              恢复较早的消息，同时保留当前位置。
            </p>
          </CardFooter>
        </Card>
        <div className="mx-auto max-w-sm px-0.5 text-center text-xs text-balance text-muted-foreground">
          点击“加载历史记录”以载入完整对话。
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
