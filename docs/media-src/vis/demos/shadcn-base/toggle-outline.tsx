import { BoldIcon, ItalicIcon } from "lucide-react"

import { Toggle } from "@/styles/base-nova/ui/toggle"

export function ToggleOutline() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle variant="outline" aria-label="切换斜体">
        <ItalicIcon />
        Italic
      </Toggle>
      <Toggle variant="outline" aria-label="切换粗体">
        <BoldIcon />
        加粗
      </Toggle>
    </div>
  )
}
