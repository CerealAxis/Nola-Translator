import { Button } from "@/styles/base-nova/ui/button"
import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"
import { Textarea } from "@/styles/base-nova/ui/textarea"

const months = [
  { label: "MM", value: null },
  { label: "01", value: "01" },
  { label: "02", value: "02" },
  { label: "03", value: "03" },
  { label: "04", value: "04" },
  { label: "05", value: "05" },
  { label: "06", value: "06" },
  { label: "07", value: "07" },
  { label: "08", value: "08" },
  { label: "09", value: "09" },
  { label: "10", value: "10" },
  { label: "11", value: "11" },
  { label: "12", value: "12" },
]

const years = [
  { label: "YYYY", value: null },
  { label: "2024", value: "2024" },
  { label: "2025", value: "2025" },
  { label: "2026", value: "2026" },
  { label: "2027", value: "2027" },
  { label: "2028", value: "2028" },
  { label: "2029", value: "2029" },
]

export default function FieldDemo() {
  return (
    <div className="w-full max-w-md">
      <form>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>支付方式</FieldLegend>
            <FieldDescription>
              所有交易均经过加密并安全处理。
            </FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="checkout-7j9-card-name-43j">
                  持卡人姓名
                </FieldLabel>
                <Input
                  id="checkout-7j9-card-name-43j"
                  placeholder="小兔子"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="checkout-7j9-card-number-uw1">
                  卡号
                </FieldLabel>
                <Input
                  id="checkout-7j9-card-number-uw1"
                  placeholder="1234 5678 9012 3456"
                  required
                />
                <FieldDescription>
                  输入 16 位卡号
                </FieldDescription>
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field>
                  <FieldLabel htmlFor="checkout-exp-month-ts6">
                    月
                  </FieldLabel>
                  <Select items={months}>
                    <SelectTrigger id="checkout-exp-month-ts6">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {months.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="checkout-7j9-exp-year-f59">
                    年
                  </FieldLabel>
                  <Select items={years}>
                    <SelectTrigger id="checkout-7j9-exp-year-f59">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {years.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="checkout-7j9-cvv">安全码</FieldLabel>
                  <Input id="checkout-7j9-cvv" placeholder="123" required />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>账单地址</FieldLegend>
            <FieldDescription>
              与付款方式关联的账单地址
            </FieldDescription>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="checkout-7j9-same-as-shipping-wgm"
                  defaultChecked
                />
                <FieldLabel
                  htmlFor="checkout-7j9-same-as-shipping-wgm"
                  className="font-normal"
                >
                  与收货地址相同
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="checkout-7j9-optional-comments">
                  评论
                </FieldLabel>
                <Textarea
                  id="checkout-7j9-optional-comments"
                  placeholder="添加其他备注"
                  className="resize-none"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          <Field orientation="horizontal">
            <Button type="submit">提交</Button>
            <Button variant="outline" type="button">
              取消
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
