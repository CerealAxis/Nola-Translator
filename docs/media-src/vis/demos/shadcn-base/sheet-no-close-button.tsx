import { Button } from "@/styles/base-nova/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/styles/base-nova/ui/sheet"

export default function SheetNoCloseButton() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        打开侧边面板
      </SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>不显示关闭按钮</SheetTitle>
          <SheetDescription>
            此侧边面板右上角没有关闭按钮。点击外部区域即可关闭。
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}
