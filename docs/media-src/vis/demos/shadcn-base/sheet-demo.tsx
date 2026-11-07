import { Button } from "@/styles/base-nova/ui/button"
import { Input } from "@/styles/base-nova/ui/input"
import { Label } from "@/styles/base-nova/ui/label"
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

export default function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>打开</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>编辑个人资料</SheetTitle>
          <SheetDescription>
            在此修改个人资料。完成后点击保存。
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 auto-rows-min gap-6 px-4">
          <div className="grid gap-3">
            <Label htmlFor="sheet-demo-name">名称</Label>
            <Input id="sheet-demo-name" defaultValue="Pedro Duarte" />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="sheet-demo-username">用户名</Label>
            <Input id="sheet-demo-username" defaultValue="@peduarte" />
          </div>
        </div>
        <SheetFooter>
          <Button type="submit">保存更改</Button>
          <SheetClose render={<Button variant="outline" />}>关闭</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
