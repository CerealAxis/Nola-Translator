import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputInvalid() {
  return (
    <Field data-invalid>
      <FieldLabel htmlFor="input-invalid">输入无效</FieldLabel>
      <Input id="input-invalid" placeholder="错误" aria-invalid />
      <FieldDescription>
        此字段存在验证错误。
      </FieldDescription>
    </Field>
  )
}
