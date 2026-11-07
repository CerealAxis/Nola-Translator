import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export function RadioGroupFieldset() {
  return (
    <FieldSet className="w-full max-w-xs">
      <FieldLegend variant="label">订阅方案</FieldLegend>
      <FieldDescription>
        年付和终身方案可节省更多费用。
      </FieldDescription>
      <RadioGroup defaultValue="monthly">
        <Field orientation="horizontal">
          <RadioGroupItem value="monthly" id="plan-monthly" />
          <FieldLabel htmlFor="plan-monthly" className="font-normal">
            月付（$9.99/月）
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="yearly" id="plan-yearly" />
          <FieldLabel htmlFor="plan-yearly" className="font-normal">
            年付（$99.99/年）
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="lifetime" id="plan-lifetime" />
          <FieldLabel htmlFor="plan-lifetime" className="font-normal">
            终身版（$299.99）
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  )
}
