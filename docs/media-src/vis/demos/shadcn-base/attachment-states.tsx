import {
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  FileWarningIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/styles/base-rhea/ui/attachment"
import { Spinner } from "@/styles/base-rhea/ui/spinner"

export function AttachmentStates() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2 py-12">
      <Attachment state="idle" className="w-full">
        <AttachmentMedia>
          <ClockIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>已选文件.pdf</AttachmentTitle>
          <AttachmentDescription>已准备好上传</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="移除 已选文件.pdf">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="uploading" className="w-full">
        <AttachmentMedia>
          <Spinner />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>设计规范.zip</AttachmentTitle>
          <AttachmentDescription>正在上传 · 64%</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="取消上传">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="processing" className="w-full">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>市场调研.pdf</AttachmentTitle>
          <AttachmentDescription>正在处理文档</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="移除 市场调研.pdf">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="error" className="w-full">
        <AttachmentMedia>
          <FileWarningIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>财务模型.xlsx</AttachmentTitle>
          <AttachmentDescription>
            上传失败，请重试。
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="重试上传">
            <RefreshCwIcon />
          </AttachmentAction>
          <AttachmentAction aria-label="移除 财务模型.xlsx">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="done" className="w-full">
        <AttachmentMedia>
          <CheckIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>已上传报告.pdf</AttachmentTitle>
          <AttachmentDescription>已上传 · 1.8 MB</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="移除 已上传报告.pdf">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  )
}
