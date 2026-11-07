import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/styles/base-rhea/ui/avatar"
import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
} from "@/styles/base-rhea/ui/message"

export function MessageGroupDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6 py-12">
      <MessageGroup>
        <Message>
          <MessageAvatar />
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent>我检查过注册表地址。</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
        <Message>
          <MessageAvatar>
            <Avatar>
              <AvatarImage src="/avatars/02.png" alt="@avatar" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent>
                组件和示例 JSON 现在位于 UI 注册表中。
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageGroup>
    </div>
  )
}
