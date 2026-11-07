import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/styles/base-nova/ui/field"

export function CheckboxDescription() {
  return (
    <FieldGroup className="mx-auto w-72">
      <Field orientation="horizontal">
        <Checkbox
          id="terms-checkbox-desc"
          name="terms-checkbox-desc"
          defaultChecked
        />
        <FieldContent>
          <FieldLabel htmlFor="terms-checkbox-desc">
            接受条款和条件
          </FieldLabel>
          <FieldDescription>
            勾选此框即表示你同意条款和条件。
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}
