import { Field, FieldLabel } from "@/styles/base-nova/ui/field"
import { Switch } from "@/styles/base-nova/ui/switch"

export default function FieldSwitch() {
  return (
    <Field orientation="horizontal" className="w-fit">
      <FieldLabel htmlFor="2fa">多重身份验证</FieldLabel>
      <Switch id="2fa" />
    </Field>
  )
}
