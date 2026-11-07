"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/styles/base-nova/ui/combobox"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/styles/base-nova/ui/item"

const countries = [
  { code: "", value: "", continent: "", label: "选择国家/地区" },
  {
    code: "ar",
    value: "argentina",
    label: "阿根廷",
    continent: "南美洲",
  },
  { code: "au", value: "australia", label: "澳大利亚", continent: "大洋洲" },
  { code: "br", value: "brazil", label: "巴西", continent: "南美洲" },
  { code: "ca", value: "canada", label: "加拿大", continent: "北美洲" },
  { code: "cn", value: "china", label: "中国", continent: "亚洲" },
  {
    code: "co",
    value: "colombia",
    label: "哥伦比亚",
    continent: "南美洲",
  },
  { code: "eg", value: "egypt", label: "埃及", continent: "非洲" },
  { code: "fr", value: "france", label: "法国", continent: "欧洲" },
  { code: "de", value: "germany", label: "德国", continent: "欧洲" },
  { code: "it", value: "italy", label: "意大利", continent: "欧洲" },
  { code: "jp", value: "japan", label: "日本", continent: "亚洲" },
  { code: "ke", value: "kenya", label: "肯尼亚", continent: "非洲" },
  { code: "mx", value: "mexico", label: "墨西哥", continent: "北美洲" },
  {
    code: "nz",
    value: "new-zealand",
    label: "新西兰",
    continent: "大洋洲",
  },
  { code: "ng", value: "nigeria", label: "尼日利亚", continent: "非洲" },
  {
    code: "za",
    value: "south-africa",
    label: "南非",
    continent: "非洲",
  },
  { code: "kr", value: "south-korea", label: "韩国", continent: "亚洲" },
  {
    code: "gb",
    value: "united-kingdom",
    label: "英国",
    continent: "欧洲",
  },
  {
    code: "us",
    value: "united-states",
    label: "美国",
    continent: "北美洲",
  },
]

export function ComboboxWithCustomItems() {
  return (
    <Combobox
      items={countries.filter((country) => country.code !== "")}
      itemToStringValue={(country: (typeof countries)[number]) => country.label}
    >
      <ComboboxInput placeholder="搜索国家/地区..." />
      <ComboboxContent>
        <ComboboxEmpty>未找到国家/地区。</ComboboxEmpty>
        <ComboboxList>
          {(country) => (
            <ComboboxItem key={country.code} value={country}>
              <Item size="xs" className="p-0">
                <ItemContent>
                  <ItemTitle className="whitespace-nowrap">
                    {country.label}
                  </ItemTitle>
                  <ItemDescription>
                    {country.continent} ({country.code})
                  </ItemDescription>
                </ItemContent>
              </Item>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
