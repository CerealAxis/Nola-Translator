import { Toggle } from "@/styles/base-nova/ui/toggle"

export function ToggleDisabled() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle aria-label="切换禁用状态" disabled>
        已禁用
      </Toggle>
      <Toggle variant="outline" aria-label="切换禁用描边" disabled>
        已禁用
      </Toggle>
    </div>
  )
}
