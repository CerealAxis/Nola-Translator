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
import { Input } from "@/styles/base-nova/ui/input"
import { Label } from "@/styles/base-nova/ui/label"

export function DialogCloseButton() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>分享</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享链接</DialogTitle>
          <DialogDescription>
            任何拥有此链接的人都可以查看。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="link" className="sr-only">
              链接
            </Label>
            <Input
              id="link"
              defaultValue="https://ui.shadcn.com/docs/installation"
              readOnly
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <DialogClose render={<Button type="button" />}>关闭</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
