import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export default function FieldInput() {
  return (
    <FieldSet className="w-full max-w-xs">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input id="username" type="text" placeholder="马克斯·莱特" />
          <FieldDescription>
            为账户设置一个唯一的用户名。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <FieldDescription>
            至少需要 8 个字符。
          </FieldDescription>
          <Input id="password" type="password" placeholder="••••••••" />
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
