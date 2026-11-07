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

export function InputGroupBlockEnd() {
  return (
    <FieldGroup className="max-w-sm">
      <Field>
        <FieldLabel htmlFor="block-end-input">输入框</FieldLabel>
        <InputGroup className="h-auto">
          <InputGroupInput id="block-end-input" placeholder="输入金额" />
          <InputGroupAddon align="block-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>页脚位于输入框下方。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="block-end-textarea">多行文本框</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="block-end-textarea"
            placeholder="写下评论..."
          />
          <InputGroupAddon align="block-end">
            <InputGroupText>0/280</InputGroupText>
            <InputGroupButton variant="default" size="sm" className="ml-auto">
              发布
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          页脚位于多行文本框下方。
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
