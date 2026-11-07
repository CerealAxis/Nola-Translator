import { ArrowUpRightIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"

export default function ButtonSize() {
  return (
    <div className="flex flex-col items-start gap-8 sm:flex-row">
      <div className="flex items-start gap-2">
        <Button size="xs" variant="outline">
          超小
        </Button>
        <Button size="icon-xs" aria-label="提交" variant="outline">
          <ArrowUpRightIcon />
        </Button>
      </div>
      <div className="flex items-start gap-2">
        <Button size="sm" variant="outline">
          小
        </Button>
        <Button size="icon-sm" aria-label="提交" variant="outline">
          <ArrowUpRightIcon />
        </Button>
      </div>
      <div className="flex items-start gap-2">
        <Button variant="outline">默认</Button>
        <Button size="icon" aria-label="提交" variant="outline">
          <ArrowUpRightIcon />
        </Button>
      </div>
      <div className="flex items-start gap-2">
        <Button variant="outline" size="lg">
          大
        </Button>
        <Button size="icon-lg" aria-label="提交" variant="outline">
          <ArrowUpRightIcon />
        </Button>
      </div>
    </div>
  )
}
