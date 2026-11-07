import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import { Field, FieldLabel } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputButtonGroup() {
  return (
    <Field>
      <FieldLabel htmlFor="input-button-group">搜索</FieldLabel>
      <ButtonGroup>
        <Input id="input-button-group" placeholder="输入内容以搜索..." />
        <Button variant="outline">搜索</Button>
      </ButtonGroup>
    </Field>
  )
}
