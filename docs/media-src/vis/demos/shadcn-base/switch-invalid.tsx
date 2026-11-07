import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Switch } from "@/styles/base-nova/ui/switch"

export function SwitchInvalid() {
  return (
    <Field orientation="horizontal" className="max-w-sm" data-invalid>
      <FieldContent>
        <FieldLabel htmlFor="switch-terms">
          接受条款和条件
        </FieldLabel>
        <FieldDescription>
          你必须接受条款和条件才能继续。
        </FieldDescription>
      </FieldContent>
      <Switch id="switch-terms" aria-invalid />
    </Field>
  )
}
