import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"

export function BubbleGroupDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Bubble variant="muted">
        <BubbleContent>能告诉我遇到什么问题吗？</BubbleContent>
      </Bubble>
      <BubbleGroup>
        <Bubble align="end">
          <BubbleContent>你说呢！</BubbleContent>
        </Bubble>
        <Bubble align="end">
          <BubbleContent>昨天还好好的，是你弄坏的！</BubbleContent>
        </Bubble>
        <Bubble align="end">
          <BubbleContent>找到并修复问题。</BubbleContent>
          <BubbleReactions aria-label="反应：眼睛" align="start">
            <span>👀</span>
          </BubbleReactions>
        </Bubble>
      </BubbleGroup>
      <Bubble variant="muted">
        <BubbleContent>
          要我对比一下昨天和今天的你吗？差别有点明显。
        </BubbleContent>
      </Bubble>
    </div>
  )
}
