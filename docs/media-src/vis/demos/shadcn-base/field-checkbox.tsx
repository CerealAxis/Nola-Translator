import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/styles/base-nova/ui/field"

export function FieldCheckbox() {
  return (
    <FieldGroup className="w-full max-w-xs">
      <FieldSet>
        <FieldLegend variant="label">
          在桌面显示这些项目
        </FieldLegend>
        <FieldDescription>
          选择要在桌面显示的项目。
        </FieldDescription>
        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <Checkbox id="finder-pref-9k2-hard-disks-ljj" />
            <FieldLabel
              htmlFor="finder-pref-9k2-hard-disks-ljj"
              className="font-normal"
              defaultChecked
            >
              硬盘
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="finder-pref-9k2-external-disks-1yg" />
            <FieldLabel
              htmlFor="finder-pref-9k2-external-disks-1yg"
              className="font-normal"
            >
              外置磁盘
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="finder-pref-9k2-cds-dvds-fzt" />
            <FieldLabel
              htmlFor="finder-pref-9k2-cds-dvds-fzt"
              className="font-normal"
            >
              CD、DVD 和 iPod
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="finder-pref-9k2-connected-servers-6l2" />
            <FieldLabel
              htmlFor="finder-pref-9k2-connected-servers-6l2"
              className="font-normal"
            >
              已连接的服务器
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <Field orientation="horizontal">
        <Checkbox id="finder-pref-9k2-sync-folders-nep" defaultChecked />
        <FieldContent>
          <FieldLabel htmlFor="finder-pref-9k2-sync-folders-nep">
            同步“桌面”和“文稿”文件夹
          </FieldLabel>
          <FieldDescription>
            正在将“桌面”和“文稿”文件夹同步到 iCloud 云盘，你可以从其他设备访问这些文件。
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}
