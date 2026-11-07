import { EyeOffIcon } from "lucide-react"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/styles/base-nova/ui/input-group"

export function InputGroupInlineEnd() {
  return (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="inline-end-input">输入框</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="inline-end-input"
          type="password"
          placeholder="输入密码"
        />
        <InputGroupAddon align="inline-end">
          <EyeOffIcon />
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>图标位于末尾。</FieldDescription>
    </Field>
  )
}
