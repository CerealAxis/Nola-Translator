import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/styles/base-rhea/ui/message"

export function MessageHeaderFooterDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Message>
        <MessageContent>
          <MessageHeader>奥利维亚</MessageHeader>
          <Bubble variant="muted">
            <BubbleContent>我已经检查过日志了。</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>
              将报告发送给团队。如需帮助，请联系 @shadcn。
            </BubbleContent>
          </Bubble>
          <MessageFooter>
            <div>
              已读 <span className="font-normal">昨天</span>
            </div>
          </MessageFooter>
        </MessageContent>
      </Message>
    </div>
  )
}
