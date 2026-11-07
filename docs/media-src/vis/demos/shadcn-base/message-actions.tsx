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
            <Button variant="ghost" size="icon" aria-label="复制" title="复制">
              <CopyIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="喜欢" title="喜欢">
              <ThumbsUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="不喜欢"
              title="不喜欢"
            >
              <ThumbsDownIcon />
            </Button>
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
            <Button
              variant="ghost"
              size="icon-xs"
              title="重试"
              aria-label="重试"
            >
              <RefreshCcwIcon />
            </Button>
          </MessageFooter>
        </MessageContent>
      </Message>
    </div>
  )
}
