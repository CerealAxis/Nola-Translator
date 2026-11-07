import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"

export function BubbleDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Bubble align="end">
        <BubbleContent>你好，最近怎么样？</BubbleContent>
      </Bubble>
      <BubbleGroup>
        <Bubble variant="muted">
          <BubbleContent>嗨！想看看对话气泡吗？</BubbleContent>
        </Bubble>
        <Bubble variant="muted">
          <BubbleContent>
            我可以将消息分组、切换位置，让整个对话更易浏览。
          </BubbleContent>
          <BubbleReactions role="img" aria-label="反应：点赞">
            <span>👍</span>
          </BubbleReactions>
        </Bubble>
      </BubbleGroup>
      <Bubble align="end">
        <BubbleContent>好，来展示一下你的演示吧。</BubbleContent>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          是的，你正在阅读一个展示自身的演示，确实很有元味，也很符合主题。
        </BubbleContent>
        <BubbleReactions
          role="img"
          aria-label="反应：点赞、火焰、眼睛等 2 项"
        >
          <span>👍</span>
          <span>🔥</span>
          <span>👀</span>
          <span>+2</span>
        </BubbleReactions>
      </Bubble>
    </div>
  )
}
