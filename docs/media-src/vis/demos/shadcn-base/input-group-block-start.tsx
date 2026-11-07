import { CopyIcon, FileCodeIcon } from "lucide-react"

import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/styles/base-nova/ui/input-group"

export function InputGroupBlockStart() {
  return (
    <FieldGroup className="max-w-sm">
      <Field>
        <FieldLabel htmlFor="block-start-input">输入框</FieldLabel>
        <InputGroup className="h-auto">
          <InputGroupInput
            id="block-start-input"
            placeholder="输入姓名"
          />
          <InputGroupAddon align="block-start">
            <InputGroupText>姓名</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>页眉位于输入框上方。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="block-start-textarea">多行文本框</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="block-start-textarea"
            placeholder="console.log('Hello, world!');"
            className="font-mono text-sm"
          />
          <InputGroupAddon align="block-start">
            <FileCodeIcon className="text-muted-foreground" />
            <InputGroupText className="font-mono">script.js</InputGroupText>
            <InputGroupButton size="icon-xs" className="ml-auto">
              <CopyIcon />
              <span className="sr-only">复制</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          页眉位于多行文本框上方。
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
