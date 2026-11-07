import { Button } from "@/styles/base-nova/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"

export function PopoverForm() {
  return (
    <>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" />}>
          打开弹出层
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <PopoverHeader>
            <PopoverTitle>尺寸</PopoverTitle>
            <PopoverDescription>
              设置图层尺寸。
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="gap-4">
            <Field orientation="horizontal">
              <FieldLabel htmlFor="width" className="w-1/2">
                宽度
              </FieldLabel>
              <Input id="width" defaultValue="100%" />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="height" className="w-1/2">
                高度
              </FieldLabel>
              <Input id="height" defaultValue="25px" />
            </Field>
          </FieldGroup>
        </PopoverContent>
      </Popover>
    </>
  )
}
