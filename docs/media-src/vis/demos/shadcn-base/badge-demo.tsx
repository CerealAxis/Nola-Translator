import { Badge } from "@/styles/base-nova/ui/badge"

export default function BadgeDemo() {
  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      <Badge>徽标</Badge>
      <Badge variant="secondary">次要</Badge>
      <Badge variant="destructive">危险</Badge>
      <Badge variant="outline">描边</Badge>
    </div>
  )
}
