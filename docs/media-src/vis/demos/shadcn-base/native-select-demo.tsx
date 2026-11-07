import {
  NativeSelect,
  NativeSelectOption,
} from "@/styles/base-nova/ui/native-select"

export default function NativeSelectDemo() {
  return (
    <NativeSelect>
      <NativeSelectOption value="">选择状态</NativeSelectOption>
      <NativeSelectOption value="todo">待办</NativeSelectOption>
      <NativeSelectOption value="in-progress">进行中</NativeSelectOption>
      <NativeSelectOption value="done">完成</NativeSelectOption>
      <NativeSelectOption value="cancelled">已取消</NativeSelectOption>
    </NativeSelect>
  )
}
