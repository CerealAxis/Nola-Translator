"use client"

import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/styles/base-nova/ui/field"
import { Label } from "@/styles/base-nova/ui/label"

export default function CheckboxDemo() {
  return (
    <FieldGroup className="max-w-sm">
      <Field orientation="horizontal">
        <Checkbox id="terms-checkbox" name="terms-checkbox" />
        <Label htmlFor="terms-checkbox">接受条款和条件</Label>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id="terms-checkbox-2"
          name="terms-checkbox-2"
          defaultChecked
        />
        <FieldContent>
          <FieldLabel htmlFor="terms-checkbox-2">
            接受条款和条件
          </FieldLabel>
          <FieldDescription>
            勾选此框即表示你同意条款。
          </FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal" data-disabled>
        <Checkbox id="toggle-checkbox" name="toggle-checkbox" disabled />
        <FieldLabel htmlFor="toggle-checkbox">启用通知</FieldLabel>
      </Field>
      <FieldLabel>
        <Field orientation="horizontal">
          <Checkbox id="toggle-checkbox-2" name="toggle-checkbox-2" />
          <FieldContent>
            <FieldTitle>启用通知</FieldTitle>
            <FieldDescription>
              你可以随时启用或关闭通知。
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </FieldGroup>
  )
}
