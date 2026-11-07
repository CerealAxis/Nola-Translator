import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export function RadioGroupInvalid() {
  return (
    <FieldSet className="w-full max-w-xs">
      <FieldLegend variant="label">通知偏好</FieldLegend>
      <FieldDescription>
        选择接收通知的方式。
      </FieldDescription>
      <RadioGroup defaultValue="email">
        <Field orientation="horizontal" data-invalid>
          <RadioGroupItem value="email" id="invalid-email" aria-invalid />
          <FieldLabel htmlFor="invalid-email" className="font-normal">
            仅邮件
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" data-invalid>
          <RadioGroupItem value="sms" id="invalid-sms" aria-invalid />
          <FieldLabel htmlFor="invalid-sms" className="font-normal">
            仅短信
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" data-invalid>
          <RadioGroupItem value="both" id="invalid-both" aria-invalid />
          <FieldLabel htmlFor="invalid-both" className="font-normal">
            邮件和短信
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  )
}
