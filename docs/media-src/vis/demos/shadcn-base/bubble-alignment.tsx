import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"

export function BubbleAlignmentDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Bubble variant="muted">
        <BubbleContent>
          此气泡与起始位置对齐，这是默认对齐方式。
        </BubbleContent>
      </Bubble>
      <Bubble align="end">
        <BubbleContent>
          此气泡与末尾对齐，适用于用户消息。
        </BubbleContent>
      </Bubble>
    </div>
  )
}
