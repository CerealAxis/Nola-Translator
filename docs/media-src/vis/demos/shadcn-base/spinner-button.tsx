import { Button } from "@/styles/base-nova/ui/button"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export function SpinnerButton() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Button disabled size="sm">
        <Spinner data-icon="inline-start" />
        正在加载...
      </Button>
      <Button variant="outline" disabled size="sm">
        <Spinner data-icon="inline-start" />
        请稍候
      </Button>
      <Button variant="secondary" disabled size="sm">
        <Spinner data-icon="inline-start" />
        正在处理中
      </Button>
    </div>
  )
}
