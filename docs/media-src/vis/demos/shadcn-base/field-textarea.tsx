import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export default function FieldTextarea() {
  return (
    <FieldSet className="w-full max-w-xs">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="feedback">反馈</FieldLabel>
          <Textarea
            id="feedback"
            placeholder="你的反馈有助于我们改进..."
            rows={4}
          />
          <FieldDescription>
            分享你对我们服务的看法。
          </FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
