import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/styles/base-rhea/ui/avatar"
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"
import { Marker, MarkerContent } from "@/styles/base-rhea/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/styles/base-rhea/ui/message"

export function MessageDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6 py-12">
      <Message align="end">
        <MessageAvatar>
          <Avatar>
            <AvatarImage src="/avatars/10.png" alt="@me" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <Bubble>
            <BubbleContent>正在快速部署到生产环境。</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message>
        <MessageAvatar>
          <Avatar>
            <AvatarImage src="/avatars/02.png" alt="@rabbit" />
            <AvatarFallback>R</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent>现在是周五下午 4:55。</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageAvatar>
          <Avatar>
            <AvatarImage src="/avatars/10.png" alt="@me" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <Bubble>
            <BubbleContent>只需要修改一行。</BubbleContent>
          </Bubble>
          <MessageFooter>已送达</MessageFooter>
        </MessageContent>
      </Message>
      <Message>
        <MessageAvatar>
          <Avatar>
            <AvatarImage src="/avatars/02.png" alt="@rabbit" />
            <AvatarFallback>R</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <BubbleGroup>
            <Bubble variant="muted">
              <BubbleContent>
                这始终只需改一行代码 😭。
              </BubbleContent>
            </Bubble>
            <Bubble variant="muted">
              <BubbleContent>好的，我来看看。</BubbleContent>
              <BubbleReactions aria-label="反应：点赞">
                <span>👍</span>
              </BubbleReactions>
            </Bubble>
          </BubbleGroup>
        </MessageContent>
      </Message>
      <Marker role="status">
        <MarkerContent className="shimmer">
          <span className="font-medium">奥利弗</span> 正在输入...
        </MarkerContent>
      </Marker>
    </div>
  )
}
