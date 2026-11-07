import { BookmarkIcon } from "lucide-react"

import { Toggle } from "@/styles/base-nova/ui/toggle"

export function ToggleDemo() {
  return (
    <Toggle aria-label="切换书签" size="sm" variant="outline">
      <BookmarkIcon className="group-aria-pressed/toggle:fill-foreground" />
      书签
    </Toggle>
  )
}
