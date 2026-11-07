import { Field, FieldGroup, FieldLabel } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputGrid() {
  return (
    <FieldGroup className="grid max-w-sm grid-cols-2">
      <Field>
        <FieldLabel htmlFor="first-name">名</FieldLabel>
        <Input id="first-name" placeholder="李明" />
      </Field>
      <Field>
        <FieldLabel htmlFor="last-name">姓氏</FieldLabel>
        <Input id="last-name" placeholder="明" />
      </Field>
    </FieldGroup>
  )
}
