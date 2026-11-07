import { Badge } from "@/styles/base-nova/ui/badge"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export function BadgeWithSpinner() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="destructive">
        <Spinner data-icon="inline-start" />
        正在删除
      </Badge>
      <Badge variant="secondary">
        正在生成
        <Spinner data-icon="inline-end" />
      </Badge>
    </div>
  )
}
