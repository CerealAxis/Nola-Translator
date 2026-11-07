import { CopyIcon, FileSearchIcon, XIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/styles/base-rhea/ui/attachment"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-rhea/ui/dialog"

export function AttachmentTriggerDemo() {
  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <Dialog>
        <Attachment className="w-full">
          <AttachmentMedia>
            <FileSearchIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>研究摘要.pdf</AttachmentTitle>
            <AttachmentDescription>打开预览对话框</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction aria-label="复制链接">
              <CopyIcon />
            </AttachmentAction>
            <AttachmentAction aria-label="移除 研究摘要.pdf">
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
          <DialogTrigger
            render={
              <AttachmentTrigger aria-label="预览 研究摘要.pdf" />
            }
          />
        </Attachment>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>研究摘要.pdf</DialogTitle>
            <DialogDescription>
              附件触发区填满卡片并打开对话框，卡片上方的操作仍可独立点击。
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
