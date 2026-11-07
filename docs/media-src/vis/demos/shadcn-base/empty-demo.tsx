import { IconFolderCode } from "@tabler/icons-react"
import { ArrowUpRightIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-nova/ui/empty"

export default function EmptyDemo() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFolderCode />
        </EmptyMedia>
        <EmptyTitle>暂无项目</EmptyTitle>
        <EmptyDescription>
          你还没有创建项目。创建第一个项目即可开始。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button>创建项目</Button>
        <Button variant="outline">导入项目</Button>
      </EmptyContent>
      <Button
        variant="link"
        render={<a href="#" />}
        className="text-muted-foreground"
        size="sm"
        nativeButton={false}
      >
        了解更多 <ArrowUpRightIcon />
      </Button>
    </Empty>
  )
}
