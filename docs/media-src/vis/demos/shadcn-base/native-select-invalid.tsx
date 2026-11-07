import {
  NativeSelect,
  NativeSelectOption,
} from "@/styles/base-nova/ui/native-select"

export function NativeSelectInvalid() {
  return (
    <NativeSelect aria-invalid="true">
      <NativeSelectOption value="">错误状态</NativeSelectOption>
      <NativeSelectOption value="apple">苹果</NativeSelectOption>
      <NativeSelectOption value="banana">香蕉</NativeSelectOption>
      <NativeSelectOption value="blueberry">蓝莓</NativeSelectOption>
    </NativeSelect>
  )
}
