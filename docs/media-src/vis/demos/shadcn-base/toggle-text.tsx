import { ItalicIcon } from "lucide-react"

import { Toggle } from "@/styles/base-nova/ui/toggle"

export function ToggleText() {
  return (
    <Toggle aria-label="切换斜体">
      <ItalicIcon />
      Italic
    </Toggle>
  )
}
