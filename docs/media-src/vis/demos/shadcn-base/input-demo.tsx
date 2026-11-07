import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputDemo() {
  return (
    <Field>
      <FieldLabel htmlFor="input-demo-api-key">API 密钥</FieldLabel>
      <Input id="input-demo-api-key" type="password" placeholder="sk-..." />
      <FieldDescription>
        你的 API 密钥经过加密并安全存储。
      </FieldDescription>
    </Field>
  )
}
