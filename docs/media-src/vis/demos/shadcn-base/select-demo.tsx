import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

const items = [
  { label: "选择水果", value: null },
  { label: "苹果", value: "apple" },
  { label: "香蕉", value: "banana" },
  { label: "蓝莓", value: "blueberry" },
  { label: "葡萄", value: "grapes" },
  { label: "菠萝", value: "pineapple" },
]

export function SelectDemo() {
  return (
    <Select items={items}>
      <SelectTrigger className="w-full max-w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>水果</SelectLabel>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
