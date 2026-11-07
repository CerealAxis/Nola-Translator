import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/styles/base-nova/ui/avatar"
import { Button } from "@/styles/base-nova/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/styles/base-nova/ui/hover-card"

export default function HoverCardDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={10}
        closeDelay={100}
        render={<Button variant="link" />}
      >
        将鼠标悬停于此
      </HoverCardTrigger>
      <HoverCardContent className="flex w-64 flex-col gap-0.5">
        <div className="font-semibold">@nextjs</div>
        <div>由 @vercel 创建并维护的 React 框架。</div>
        <div className="mt-1 text-xs text-muted-foreground">
          加入于 2021 年 12 月
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
