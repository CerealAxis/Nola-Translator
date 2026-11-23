import {
  CopyIcon,
  RefreshCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/styles/base-rhea/ui/message"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/styles/base-rhea/ui/tooltip"

export function MessageActionsDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Message>
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent>
              安装失败源自工作区软件包。
            </BubbleContent>
          </Bubble>
          <MessageFooter>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="复制" />}>
                <CopyIcon />
              </TooltipTrigger>
              <TooltipContent>复制</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="喜欢" />}>
                <ThumbsUpIcon />
              </TooltipTrigger>
              <TooltipContent>喜欢</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="不喜欢" />}>
                <ThumbsDownIcon />
              </TooltipTrigger>
              <TooltipContent>不喜欢</TooltipContent>
            </Tooltip>
          </MessageFooter>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>好，发我链接，我看看……</BubbleContent>
          </Bubble>
          <MessageFooter className="gap-2">
            <span className="font-normal text-destructive">发送失败</span>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="重试" />}>
                <RefreshCcwIcon />
              </TooltipTrigger>
              <TooltipContent>重试</TooltipContent>
            </Tooltip>
          </MessageFooter>
        </MessageContent>
      </Message>
    </div>
  )
}
