import { Label } from "@/styles/base-nova/ui/label"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export function RadioGroupDemo() {
  return (
    <RadioGroup defaultValue="comfortable" className="w-fit">
      <div className="flex items-center gap-3">
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">默认</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">宽松</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">紧凑</Label>
      </div>
    </RadioGroup>
  )
}
