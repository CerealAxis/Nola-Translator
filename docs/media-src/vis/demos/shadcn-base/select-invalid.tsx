import { Field, FieldError, FieldLabel } from "@/styles/base-nova/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

const items = [
  { label: "选择水果", value: null },
  { label: "苹果", value: "apple" },
  { label: "香蕉", value: "banana" },
  { label: "蓝莓", value: "blueberry" },
]

export function SelectInvalid() {
  return (
    <Field data-invalid className="w-full max-w-48">
      <FieldLabel>水果</FieldLabel>
      <Select items={items}>
        <SelectTrigger aria-invalid>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError>请选择一种水果。</FieldError>
    </Field>
  )
}
