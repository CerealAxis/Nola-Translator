import { Bold, Italic, Underline } from "lucide-react"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

export function ToggleGroupDisabled() {
  return (
    <ToggleGroup disabled>
      <ToggleGroupItem value="bold" aria-label="切换粗体">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="切换斜体">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="strikethrough" aria-label="切换删除线">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
