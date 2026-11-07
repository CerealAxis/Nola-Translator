import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/styles/base-nova/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export function RadioGroupChoiceCard() {
  return (
    <RadioGroup defaultValue="plus" className="max-w-sm">
      <FieldLabel htmlFor="plus-plan">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>加号</FieldTitle>
            <FieldDescription>
              适合个人和小型团队。
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem value="plus" id="plus-plan" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="pro-plan">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>专业版</FieldTitle>
            <FieldDescription>适合成长型企业。</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="pro" id="pro-plan" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="enterprise-plan">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>企业版</FieldTitle>
            <FieldDescription>
              适合大型团队和企业。
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem value="enterprise" id="enterprise-plan" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  )
}
