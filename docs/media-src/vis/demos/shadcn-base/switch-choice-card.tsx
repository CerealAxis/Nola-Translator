import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/styles/base-nova/ui/field"
import { Switch } from "@/styles/base-nova/ui/switch"

export function SwitchChoiceCard() {
  return (
    <FieldGroup className="w-full max-w-sm">
      <FieldLabel htmlFor="switch-share">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>跨设备分享</FieldTitle>
            <FieldDescription>
              专注模式会在设备间同步，并在你离开应用时关闭。
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-share" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="switch-notifications">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>启用通知</FieldTitle>
            <FieldDescription>
              专注模式启用或关闭时接收通知。
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-notifications" defaultChecked />
        </Field>
      </FieldLabel>
    </FieldGroup>
  )
}
