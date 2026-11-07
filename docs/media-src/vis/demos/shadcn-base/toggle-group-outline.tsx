import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

export function ToggleGroupOutline() {
  return (
    <ToggleGroup variant="outline" defaultValue={["all"]}>
      <ToggleGroupItem value="all" aria-label="切换全部">
        全部
      </ToggleGroupItem>
      <ToggleGroupItem value="missed" aria-label="切换未接收状态">
        未接收
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
