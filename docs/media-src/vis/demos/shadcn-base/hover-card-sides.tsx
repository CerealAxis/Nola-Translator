import { Button } from "@/styles/base-nova/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/styles/base-nova/ui/hover-card"

const HOVER_CARD_SIDES = ["left", "top", "bottom", "right"] as const

export function HoverCardSides() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {HOVER_CARD_SIDES.map((side) => (
        <HoverCard key={side}>
          <HoverCardTrigger
            delay={100}
            closeDelay={100}
            render={<Button variant="outline" className="capitalize" />}
          >
            {side}
          </HoverCardTrigger>
          <HoverCardContent side={side}>
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">悬浮卡片</h4>
              <p>此悬浮卡片会在 {side} 触发器旁侧。</p>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}
