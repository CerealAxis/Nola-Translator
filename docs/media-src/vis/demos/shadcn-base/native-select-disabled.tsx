import {
  NativeSelect,
  NativeSelectOption,
} from "@/styles/base-nova/ui/native-select"

export function NativeSelectDisabled() {
  return (
    <NativeSelect disabled>
      <NativeSelectOption value="">已禁用</NativeSelectOption>
      <NativeSelectOption value="apple">苹果</NativeSelectOption>
      <NativeSelectOption value="banana">香蕉</NativeSelectOption>
      <NativeSelectOption value="blueberry">蓝莓</NativeSelectOption>
    </NativeSelect>
  )
}
