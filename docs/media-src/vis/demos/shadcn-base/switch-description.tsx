import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Switch } from "@/styles/base-nova/ui/switch"

export function SwitchDescription() {
  return (
    <Field orientation="horizontal" className="max-w-sm">
      <FieldContent>
        <FieldLabel htmlFor="switch-focus-mode">
          跨设备分享
        </FieldLabel>
        <FieldDescription>
          专注模式会在设备间同步，并在你离开应用时关闭。
        </FieldDescription>
      </FieldContent>
      <Switch id="switch-focus-mode" />
    </Field>
  )
}
