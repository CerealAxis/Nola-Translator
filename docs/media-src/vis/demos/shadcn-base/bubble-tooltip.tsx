import { CheckIcon } from "lucide-react"

import {
  Bubble,
  BubbleContent,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-rhea/ui/tooltip"

export function BubbleTooltipDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 py-12">
      <Bubble variant="secondary">
        <BubbleContent>你移除了过时的路由吗？</BubbleContent>
      </Bubble>
      <Bubble align="end">
        <BubbleContent>是的，已从注册表中移除。</BubbleContent>
        <BubbleReactions>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" />}>
              <CheckIcon />
            </TooltipTrigger>
            <TooltipContent>已于 2026 年 1 月 5 日 16:32 阅读</TooltipContent>
          </Tooltip>
        </BubbleReactions>
      </Bubble>
    </div>
  )
}
