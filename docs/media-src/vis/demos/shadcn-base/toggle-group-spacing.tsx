import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

export function ToggleGroupSpacing() {
  return (
    <ToggleGroup size="sm" defaultValue={["top"]} variant="outline" spacing={2}>
      <ToggleGroupItem value="top" aria-label="切换到顶部">
        顶部
      </ToggleGroupItem>
      <ToggleGroupItem value="bottom" aria-label="切换到底部">
        底部
      </ToggleGroupItem>
      <ToggleGroupItem value="left" aria-label="切换到左侧">
        左侧
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="切换到右侧">
        右侧
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
