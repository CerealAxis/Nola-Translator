import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"

const northAmerica = [
  { label: "北美东部标准时间", value: "est" },
  { label: "北美中部标准时间", value: "cst" },
  { label: "北美山区标准时间", value: "mst" },
  { label: "北美太平洋标准时间", value: "pst" },
  { label: "阿拉斯加标准时间", value: "akst" },
  { label: "夏威夷标准时间", value: "hst" },
]

const europeAfrica = [
  { label: "格林尼治标准时间", value: "gmt" },
  { label: "中欧时间", value: "cet" },
  { label: "东欧时间", value: "eet" },
  { label: "西欧夏令时间", value: "west" },
  { label: "中非时间", value: "cat" },
  { label: "东非时间", value: "eat" },
]

const asia = [
  { label: "莫斯科时间", value: "msk" },
  { label: "印度标准时间", value: "ist" },
  { label: "中国标准时间", value: "cst_china" },
  { label: "日本标准时间", value: "jst" },
  { label: "韩国标准时间", value: "kst" },
  { label: "印度尼西亚中部标准时间", value: "ist_indonesia" },
]

const australiaPacific = [
  { label: "澳大利亚西部标准时间", value: "awst" },
  { label: "澳大利亚中部标准时间", value: "acst" },
  { label: "澳大利亚东部标准时间", value: "aest" },
  { label: "新西兰标准时间", value: "nzst" },
  { label: "斐济时间", value: "fjt" },
]

const southAmerica = [
  { label: "阿根廷时间", value: "art" },
  { label: "玻利维亚时间", value: "bot" },
  { label: "巴西利亚时间", value: "brt" },
  { label: "智利标准时间", value: "clt" },
]

const items = [
  { label: "选择时区", value: null },
  ...northAmerica,
  ...europeAfrica,
  ...asia,
  ...australiaPacific,
  ...southAmerica,
]

export function SelectScrollable() {
  return (
    <Select items={items}>
      <SelectTrigger className="w-full max-w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>北美洲</SelectLabel>
          {northAmerica.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>欧洲及非洲</SelectLabel>
          {europeAfrica.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>亚洲</SelectLabel>
          {asia.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>澳大利亚及太平洋地区</SelectLabel>
          {australiaPacific.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>南美洲</SelectLabel>
          {southAmerica.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
