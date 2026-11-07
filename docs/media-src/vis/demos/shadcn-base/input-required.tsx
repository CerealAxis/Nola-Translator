import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputRequired() {
  return (
    <Field>
      <FieldLabel htmlFor="input-required">
        必填字段 <span className="text-destructive">*</span>
      </FieldLabel>
      <Input
        id="input-required"
        placeholder="此字段为必填项"
        required
      />
      <FieldDescription>此字段为必填项。</FieldDescription>
    </Field>
  )
}
