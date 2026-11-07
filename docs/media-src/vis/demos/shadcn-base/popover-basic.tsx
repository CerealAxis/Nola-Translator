import { Button } from "@/styles/base-nova/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"

export function PopoverBasic() {
  return (
    <>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" className="w-fit" />}>
          打开弹出层
        </PopoverTrigger>
        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>尺寸</PopoverTitle>
            <PopoverDescription>
              设置图层尺寸。
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </>
  )
}
