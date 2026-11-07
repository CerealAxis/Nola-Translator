import { IconCloud } from "@tabler/icons-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-nova/ui/empty"

export default function EmptyOutline() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconCloud />
        </EmptyMedia>
        <EmptyTitle>云存储为空</EmptyTitle>
        <EmptyDescription>
          将文件上传到云存储，以便随时随地访问。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm">
          上传文件
        </Button>
      </EmptyContent>
    </Empty>
  )
}
