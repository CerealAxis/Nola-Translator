import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputDisabled() {
  return (
    <Field data-disabled>
      <FieldLabel htmlFor="input-demo-disabled">邮箱</FieldLabel>
      <Input
        id="input-demo-disabled"
        type="email"
        placeholder="邮箱"
        disabled
      />
      <FieldDescription>此字段当前已禁用。</FieldDescription>
    </Field>
  )
}
