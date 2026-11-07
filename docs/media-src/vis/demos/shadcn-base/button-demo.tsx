import { ArrowUpIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"

export default function ButtonDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2 md:flex-row">
      <Button variant="outline">按钮</Button>
      <Button variant="outline" size="icon" aria-label="提交">
        <ArrowUpIcon />
      </Button>
    </div>
  )
}
