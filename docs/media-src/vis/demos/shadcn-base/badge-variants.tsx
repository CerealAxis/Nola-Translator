import { Badge } from "@/styles/base-nova/ui/badge"

export function BadgeVariants() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>默认</Badge>
      <Badge variant="secondary">次要</Badge>
      <Badge variant="destructive">危险</Badge>
      <Badge variant="outline">描边</Badge>
      <Badge variant="ghost">幽灵</Badge>
    </div>
  )
}
