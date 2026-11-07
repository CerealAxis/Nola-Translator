import { Button } from "@/styles/base-nova/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-nova/ui/dialog"

export function DialogScrollableContent() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        可滚动内容
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>可滚动内容</DialogTitle>
          <DialogDescription>
            这是一个内容可滚动的对话框。
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <p key={index} className="mb-4 leading-normal">
              这是一段用于展示排版效果的示例文字。它可以用来观察段落、行距和文本长度在界面中的呈现方式。
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
