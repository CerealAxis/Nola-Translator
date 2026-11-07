import { Field, FieldLabel } from "@/styles/base-nova/ui/field"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export function TextareaDisabled() {
  return (
    <Field data-disabled>
      <FieldLabel htmlFor="textarea-disabled">消息</FieldLabel>
      <Textarea
        id="textarea-disabled"
        placeholder="在此输入消息。"
        disabled
      />
    </Field>
  )
}
