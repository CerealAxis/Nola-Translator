import { BadgeCheck, BookmarkIcon } from "lucide-react"

import { Badge } from "@/styles/base-nova/ui/badge"

export function BadgeWithIconLeft() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">
        <BadgeCheck data-icon="inline-start" />
        已验证
      </Badge>
      <Badge variant="outline">
        书签
        <BookmarkIcon data-icon="inline-end" />
      </Badge>
    </div>
  )
}
