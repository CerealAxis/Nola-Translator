import { Button } from "@/styles/base-nova/ui/button"
import { Field } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function InputInline() {
  return (
    <Field orientation="horizontal">
      <Input type="search" placeholder="搜索..." />
      <Button>搜索</Button>
    </Field>
  )
}
