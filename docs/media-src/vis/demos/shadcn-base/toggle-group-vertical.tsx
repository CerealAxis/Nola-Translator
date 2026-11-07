import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

export function ToggleGroupVertical() {
  return (
    <ToggleGroup
      multiple
      orientation="vertical"
      spacing={1}
      defaultValue={["bold", "italic"]}
    >
      <ToggleGroupItem value="bold" aria-label="切换粗体">
        <BoldIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="切换斜体">
        <ItalicIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="切换下划线">
        <UnderlineIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
