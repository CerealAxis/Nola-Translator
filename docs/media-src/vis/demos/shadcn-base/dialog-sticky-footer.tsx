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

export function DialogStickyFooter() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        固定页脚
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>固定页脚</DialogTitle>
          <DialogDescription>
            此对话框使用固定页脚，滚动内容时页脚仍保持可见。
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <p key={index} className="mb-4 leading-normal">
              这是一段用于展示排版效果的示例文字。它可以用来观察段落、行距和文本长度在界面中的呈现方式。
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
