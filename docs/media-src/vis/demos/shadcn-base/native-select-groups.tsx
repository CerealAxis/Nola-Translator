import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/styles/base-nova/ui/native-select"

export default function NativeSelectGroups() {
  return (
    <NativeSelect>
      <NativeSelectOption value="">选择部门</NativeSelectOption>
      <NativeSelectOptGroup label="工程">
        <NativeSelectOption value="frontend">前端</NativeSelectOption>
        <NativeSelectOption value="backend">后端</NativeSelectOption>
        <NativeSelectOption value="devops">运维</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="销售">
        <NativeSelectOption value="sales-rep">销售代表</NativeSelectOption>
        <NativeSelectOption value="account-manager">
          客户经理
        </NativeSelectOption>
        <NativeSelectOption value="sales-director">
          销售总监
        </NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="运营">
        <NativeSelectOption value="support">
          客户支持
        </NativeSelectOption>
        <NativeSelectOption value="product-manager">
          产品经理
        </NativeSelectOption>
        <NativeSelectOption value="ops-manager">
          运营经理
        </NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  )
}
