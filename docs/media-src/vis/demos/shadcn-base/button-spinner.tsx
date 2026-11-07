import { Button } from "@/styles/base-nova/ui/button"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export default function ButtonLoading() {
  return (
    <div className="flex gap-2">
      <Button variant="outline" disabled>
        <Spinner data-icon="inline-start" />
        正在生成
      </Button>
      <Button variant="secondary" disabled>
        正在下载
        <Spinner data-icon="inline-start" />
      </Button>
    </div>
  )
}
