import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export function TextareaField() {
  return (
    <Field>
      <FieldLabel htmlFor="textarea-message">消息</FieldLabel>
      <FieldDescription>在下方输入消息。</FieldDescription>
      <Textarea id="textarea-message" placeholder="在此输入消息。" />
    </Field>
  )
}
