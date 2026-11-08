import { Badge } from "@/styles/base-nova/ui/badge"

export function BadgeCustomColors() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className="bg-accent text-accent-foreground">
        蓝色
      </Badge>
      <Badge className="bg-chart-2/10 text-foreground">
        绿色
      </Badge>
      <Badge className="bg-chart-4/10 text-foreground">
        橙色
      </Badge>
      <Badge className="bg-chart-3/10 text-chart-3">
        紫色
      </Badge>
      <Badge className="bg-destructive/10 text-destructive">
        红色
      </Badge>
    </div>
  )
}
