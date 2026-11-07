import { Button } from "@/styles/base-nova/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/styles/base-nova/ui/sheet"

const SHEET_SIDES = ["top", "right", "bottom", "left"] as const

export default function SheetSide() {
  return (
    <div className="flex flex-wrap gap-2">
      {SHEET_SIDES.map((side) => (
        <Sheet key={side}>
          <SheetTrigger
            render={<Button variant="outline" className="capitalize" />}
          >
            {side}
          </SheetTrigger>
          <SheetContent
            side={side}
            className="data-[side=bottom]:max-h-[50vh] data-[side=top]:max-h-[50vh]"
          >
            <SheetHeader>
              <SheetTitle>编辑个人资料</SheetTitle>
              <SheetDescription>
                在此修改个人资料。完成后点击保存。
              </SheetDescription>
            </SheetHeader>
            <div className="no-scrollbar overflow-y-auto px-4">
              {Array.from({ length: 10 }).map((_, index) => (
                <p key={index} className="mb-2 leading-relaxed">
                  这是一段用于展示排版效果的示例文字。它可以用来观察段落、行距和文本长度在界面中的呈现方式。
                </p>
              ))}
            </div>
            <SheetFooter>
              <Button type="submit">保存更改</Button>
              <SheetClose render={<Button variant="outline" />}>
                取消
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  )
}
