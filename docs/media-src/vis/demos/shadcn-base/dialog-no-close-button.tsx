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

export function DialogNoCloseButton() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        不显示关闭按钮
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>不显示关闭按钮</DialogTitle>
          <DialogDescription>
            此对话框右上角没有关闭按钮。
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
