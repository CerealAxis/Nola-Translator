import { Button } from "@/styles/base-nova/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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

export function InputForm() {
  const countries = [
    { label: "美国", value: "us" },
    { label: "英国", value: "uk" },
    { label: "加拿大", value: "ca" },
  ]
  return (
    <form className="w-full max-w-sm">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="form-name">名称</FieldLabel>
          <Input
            id="form-name"
            type="text"
            placeholder="小兔子"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="form-email">邮箱</FieldLabel>
          <Input id="form-email" type="email" placeholder="john@example.com" />
          <FieldDescription>
            我们绝不会向他人透露你的邮箱。
          </FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="form-phone">电话</FieldLabel>
            <Input id="form-phone" type="tel" placeholder="+1 (555) 123-4567" />
          </Field>
          <Field>
            <FieldLabel htmlFor="form-country">国家/地区</FieldLabel>
            <Select items={countries} defaultValue="us">
              <SelectTrigger id="form-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {countries.map((country) => (
                    <SelectItem key={country.value} value={country.value}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="form-address">地址</FieldLabel>
          <Input id="form-address" type="text" placeholder="示例街道地址 123 号" />
        </Field>
        <Field orientation="horizontal">
          <Button type="button" variant="outline">
            取消
          </Button>
          <Button type="submit">提交</Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
