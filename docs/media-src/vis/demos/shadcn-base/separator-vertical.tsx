import { Separator } from "@/styles/base-nova/ui/separator"

export function SeparatorVertical() {
  return (
    <div className="flex h-5 items-center gap-4 text-sm">
      <div>博客</div>
      <Separator orientation="vertical" />
      <div>文档</div>
      <Separator orientation="vertical" />
      <div>来源</div>
    </div>
  )
}
