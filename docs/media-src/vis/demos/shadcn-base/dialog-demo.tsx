import { Button } from "@/styles/base-nova/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-nova/ui/dialog"
import { Field, FieldGroup } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"
import { Label } from "@/styles/base-nova/ui/label"

export function DialogDemo() {
  return (
    <Dialog>
      <form>
        <DialogTrigger render={<Button variant="outline" />}>
          打开对话框
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑个人资料</DialogTitle>
            <DialogDescription>
              在此修改个人资料。完成后点击保存。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">名称</Label>
              <Input id="name-1" name="name" defaultValue="Pedro Duarte" />
            </Field>
            <Field>
              <Label htmlFor="username-1">用户名</Label>
              <Input id="username-1" name="username" defaultValue="@peduarte" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit">保存更改</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}
