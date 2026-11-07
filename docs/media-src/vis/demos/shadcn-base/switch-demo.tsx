import { Label } from "@/styles/base-nova/ui/label"
import { Switch } from "@/styles/base-nova/ui/switch"

export function SwitchDemo() {
  return (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">飞行模式</Label>
    </div>
  )
}
