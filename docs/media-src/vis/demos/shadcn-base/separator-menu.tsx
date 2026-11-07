import { Separator } from "@/styles/base-nova/ui/separator"

export function SeparatorMenu() {
  return (
    <div className="flex items-center gap-2 text-sm md:gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium">设置</span>
        <span className="text-xs text-muted-foreground">
          管理偏好设置
        </span>
      </div>
      <Separator orientation="vertical" />
      <div className="flex flex-col gap-1">
        <span className="font-medium">账户</span>
        <span className="text-xs text-muted-foreground">
          个人资料与安全
        </span>
      </div>
      <Separator orientation="vertical" className="hidden md:block" />
      <div className="hidden flex-col gap-1 md:flex">
        <span className="font-medium">帮助</span>
        <span className="text-xs text-muted-foreground">支持与文档</span>
      </div>
    </div>
  )
}
