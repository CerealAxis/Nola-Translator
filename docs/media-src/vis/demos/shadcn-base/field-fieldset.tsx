import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function FieldFieldset() {
  return (
    <FieldSet className="w-full max-w-sm">
      <FieldLegend>地址信息</FieldLegend>
      <FieldDescription>
        我们需要你的地址来配送订单。
      </FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="street">街道地址</FieldLabel>
          <Input id="street" type="text" placeholder="示例街道地址 123 号" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="city">城市</FieldLabel>
            <Input id="city" type="text" placeholder="纽约" />
          </Field>
          <Field>
            <FieldLabel htmlFor="zip">邮政编码</FieldLabel>
            <Input id="zip" type="text" placeholder="90502" />
          </Field>
        </div>
      </FieldGroup>
    </FieldSet>
  )
}
