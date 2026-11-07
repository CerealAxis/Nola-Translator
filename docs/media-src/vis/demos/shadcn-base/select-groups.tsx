import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

export function SelectGroups() {
  const fruits = [
    { label: "苹果", value: "apple" },
    { label: "香蕉", value: "banana" },
    { label: "蓝莓", value: "blueberry" },
  ]
  const vegetables = [
    { label: "胡萝卜", value: "carrot" },
    { label: "西兰花", value: "broccoli" },
    { label: "菠菜", value: "spinach" },
  ]
  const allItems = [
    { label: "选择水果", value: null },
    ...fruits,
    ...vegetables,
  ]
  return (
    <Select items={allItems}>
      <SelectTrigger className="w-full max-w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>水果</SelectLabel>
          {fruits.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>蔬菜</SelectLabel>
          {vegetables.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
