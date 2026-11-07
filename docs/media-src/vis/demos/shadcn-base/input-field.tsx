import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputField() {
  return (
    <Field>
      <FieldLabel htmlFor="input-field-username">用户名</FieldLabel>
      <Input
        id="input-field-username"
        type="text"
        placeholder="输入用户名"
      />
      <FieldDescription>
        为账户设置一个唯一的用户名。
      </FieldDescription>
    </Field>
  )
}
