import { Button } from "@/styles/base-nova/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/styles/base-nova/ui/empty"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export function SpinnerEmpty() {
  return (
    <Empty className="w-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner />
        </EmptyMedia>
        <EmptyTitle>正在处理请求</EmptyTitle>
        <EmptyDescription>
          正在处理请求，请稍候。请勿刷新页面。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm">
          取消
        </Button>
      </EmptyContent>
    </Empty>
  )
}
