import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

const items = [
  { label: "选择部门", value: null },
  { label: "工程", value: "engineering" },
  { label: "设计", value: "design" },
  { label: "市场营销", value: "marketing" },
  { label: "销售", value: "sales" },
  { label: "客户支持", value: "support" },
  { label: "人力资源", value: "hr" },
  { label: "财务", value: "finance" },
  { label: "运营", value: "operations" },
]

export default function FieldSelect() {
  return (
    <Field className="w-full max-w-xs">
      <FieldLabel>部门</FieldLabel>
      <Select items={items}>
        <SelectTrigger>
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
      <FieldDescription>
        选择部门或工作领域。
      </FieldDescription>
    </Field>
  )
}
