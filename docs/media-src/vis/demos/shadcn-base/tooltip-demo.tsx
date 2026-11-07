import { Button } from "@/styles/base-nova/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-nova/ui/tooltip"

export function TooltipDemo() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        悬停
      </TooltipTrigger>
      <TooltipContent>
        <p>添加到资料库</p>
      </TooltipContent>
    </Tooltip>
  )
}
