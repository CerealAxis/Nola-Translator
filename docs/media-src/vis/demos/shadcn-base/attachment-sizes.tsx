import { FileTextIcon } from "lucide-react"

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/styles/base-rhea/ui/attachment"

export function AttachmentSizes() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 py-12">
      <Attachment size="default" className="w-full">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>默认附件</AttachmentTitle>
          <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment size="sm" className="w-full">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>小型附件</AttachmentTitle>
          <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment size="xs" className="w-full">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>超小附件</AttachmentTitle>
        </AttachmentContent>
      </Attachment>
    </div>
  )
}
