import { Button } from "@/styles/base-nova/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/styles/base-nova/ui/tooltip"

export function TooltipDisabled() {
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-block w-fit" />}>
          <Button variant="outline" disabled>
            已禁用
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>此功能暂不可用</p>
        </TooltipContent>
      </Tooltip>
    </>
  )
}
