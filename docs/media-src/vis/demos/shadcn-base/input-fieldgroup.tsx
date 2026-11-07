import { Button } from "@/styles/base-nova/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputFieldgroup() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="fieldgroup-name">名称</FieldLabel>
        <Input id="fieldgroup-name" placeholder="李明" />
      </Field>
      <Field>
        <FieldLabel htmlFor="fieldgroup-email">邮箱</FieldLabel>
        <Input
          id="fieldgroup-email"
          type="email"
          placeholder="name@example.com"
        />
        <FieldDescription>
          我们会向此地址发送更新通知。
        </FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Button type="reset" variant="outline">
          重置
        </Button>
        <Button type="submit">提交</Button>
      </Field>
    </FieldGroup>
  )
}
