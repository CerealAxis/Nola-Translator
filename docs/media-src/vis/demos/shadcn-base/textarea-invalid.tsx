import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export function TextareaInvalid() {
  return (
    <Field data-invalid>
      <FieldLabel htmlFor="textarea-invalid">消息</FieldLabel>
      <Textarea
        id="textarea-invalid"
        placeholder="在此输入消息。"
        aria-invalid
      />
      <FieldDescription>请输入有效消息。</FieldDescription>
    </Field>
  )
}
