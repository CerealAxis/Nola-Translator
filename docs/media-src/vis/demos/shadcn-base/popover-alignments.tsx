import { Button } from "@/styles/base-nova/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"

export function PopoverAlignments() {
  return (
    <>
      <div className="flex gap-6">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            开始
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40">
            起始位置对齐
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            居中
          </PopoverTrigger>
          <PopoverContent align="center" className="w-40">
            居中对齐
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            末尾
          </PopoverTrigger>
          <PopoverContent align="end" className="w-40">
            末尾对齐
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}
