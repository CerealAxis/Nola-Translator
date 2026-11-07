"use client"

import { toast } from "sonner"

import {
  Bubble,
  BubbleContent,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"

export function BubbleReactionsDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-12 py-12">
      <Bubble variant="muted" align="end">
        <BubbleContent>
          我不需要测试，我知道代码没问题。
        </BubbleContent>
        <BubbleReactions
          align="start"
          role="img"
          aria-label="反应：点赞、惊讶"
        >
          <span>👍</span>
          <span>😮</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          口气真大。好吧，我会补上测试，完成后告诉你。
        </BubbleContent>
        <BubbleReactions
          role="img"
          aria-label="反应：眼睛、火箭等 2 项"
        >
          <span>👀</span>
          <span>🚀</span>
          <span>+2</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="default" align="end">
        <BubbleContent>
          测试一次全部通过，共 142 项，结果不错！
        </BubbleContent>
        <BubbleReactions
          side="top"
          align="start"
          role="img"
          aria-label="反应：派对礼花、鼓掌"
        >
          <span>🎉</span>
          <span>👏</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="destructive">
        <BubbleContent>确定允许我运行这条命令吗？</BubbleContent>
        <BubbleReactions>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => toast.success("你点击了“是”，正在运行命令……")}
          >
            是，运行
          </Button>
        </BubbleReactions>
      </Bubble>
    </div>
  )
}
