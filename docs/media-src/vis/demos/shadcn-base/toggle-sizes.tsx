import { Toggle } from "@/styles/base-nova/ui/toggle"

export function ToggleSizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle variant="outline" aria-label="切换小尺寸" size="sm">
        小
      </Toggle>
      <Toggle variant="outline" aria-label="切换默认状态" size="default">
        默认
      </Toggle>
      <Toggle variant="outline" aria-label="切换大尺寸" size="lg">
        大
      </Toggle>
    </div>
  )
}
