import { IconBell } from "@tabler/icons-react"
import { RefreshCcwIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-nova/ui/empty"

export function EmptyMuted() {
  return (
    <Empty className="h-full bg-muted/30">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconBell />
        </EmptyMedia>
        <EmptyTitle>暂无通知</EmptyTitle>
        <EmptyDescription className="max-w-xs text-pretty">
          目前没有未读内容。新通知会显示在这里。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">
          <RefreshCcwIcon data-icon="inline-start" />
          刷新
        </Button>
      </EmptyContent>
    </Empty>
  )
}
