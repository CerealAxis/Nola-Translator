import { ChevronRightIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"

export function CardSmall() {
  const featureName = "定时报告"

  return (
    <Card size="sm" className="mx-auto w-full max-w-xs">
      <CardHeader>
        <CardTitle>{featureName}</CardTitle>
        <CardDescription>
          每周自动生成快照，无需再手动导出。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 py-2 text-sm">
          <li className="flex gap-2">
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>选择发送频率（每天或每周）。</span>
          </li>
          <li className="flex gap-2">
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>发送到频道或指定成员。</span>
          </li>
          <li className="flex gap-2">
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>包含图表、表格和关键指标。</span>
          </li>
        </ul>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button size="sm" className="w-full">
          设置定期报告
        </Button>
        <Button variant="outline" size="sm" className="w-full">
          查看新内容
        </Button>
      </CardFooter>
    </Card>
  )
}
