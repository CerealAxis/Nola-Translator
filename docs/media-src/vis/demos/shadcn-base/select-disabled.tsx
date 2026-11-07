import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

export function SelectDisabled() {
  const items = [
    { label: "选择水果", value: null },
    { label: "苹果", value: "apple" },
    { label: "香蕉", value: "banana" },
    { label: "蓝莓", value: "blueberry" },
    { label: "葡萄", value: "grapes", disabled: true },
    { label: "菠萝", value: "pineapple" },
  ]
  return (
    <Select items={items} disabled>
      <SelectTrigger className="w-full max-w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
