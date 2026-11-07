import { Badge } from "@/styles/base-nova/ui/badge"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export function SpinnerBadge() {
  return (
    <div className="flex items-center gap-4 [--radius:1.2rem]">
      <Badge>
        <Spinner data-icon="inline-start" />
        正在同步
      </Badge>
      <Badge variant="secondary">
        <Spinner data-icon="inline-start" />
        正在更新
      </Badge>
      <Badge variant="outline">
        <Spinner data-icon="inline-start" />
        正在处理中
      </Badge>
    </div>
  )
}
