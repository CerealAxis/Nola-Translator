import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputFile() {
  return (
    <Field>
      <FieldLabel htmlFor="picture">图片</FieldLabel>
      <Input id="picture" type="file" />
      <FieldDescription>选择要上传的图片。</FieldDescription>
    </Field>
  )
}
