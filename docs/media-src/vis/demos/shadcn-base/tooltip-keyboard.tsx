import { SaveIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { Kbd } from "@/styles/base-nova/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-nova/ui/tooltip"

export function TooltipKeyboard() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" size="icon-sm" />}>
        <SaveIcon />
      </TooltipTrigger>
      <TooltipContent>
        保存更改 <Kbd>S</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
