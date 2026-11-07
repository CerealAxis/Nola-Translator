import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export function RadioGroupDescription() {
  return (
    <RadioGroup defaultValue="comfortable" className="w-fit">
      <Field orientation="horizontal">
        <RadioGroupItem value="default" id="desc-r1" />
        <FieldContent>
          <FieldLabel htmlFor="desc-r1">默认</FieldLabel>
          <FieldDescription>
            适用于大多数场景的标准间距。
          </FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="comfortable" id="desc-r2" />
        <FieldContent>
          <FieldLabel htmlFor="desc-r2">宽松</FieldLabel>
          <FieldDescription>增加元素之间的间距。</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="compact" id="desc-r3" />
        <FieldContent>
          <FieldLabel htmlFor="desc-r3">紧凑</FieldLabel>
          <FieldDescription>
            适用于密集布局的最小间距。
          </FieldDescription>
        </FieldContent>
      </Field>
    </RadioGroup>
  )
}
