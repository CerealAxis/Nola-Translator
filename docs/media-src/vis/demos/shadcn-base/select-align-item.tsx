"use client"

import * as React from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import { Label } from "@/styles/base-nova/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/styles/base-nova/ui/select"
import { Switch } from "@/styles/base-nova/ui/switch"

const items = [
  { label: "选择水果", value: null },
  { label: "苹果", value: "apple" },
  { label: "香蕉", value: "banana" },
  { label: "蓝莓", value: "blueberry" },
  { label: "葡萄", value: "grapes" },
  { label: "菠萝", value: "pineapple" },
]

export function SelectAlignItem() {
  const [alignItemWithTrigger, setAlignItemWithTrigger] = React.useState(true)

  return (
    <FieldGroup className="w-full max-w-xs">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="align-item">对齐项目</FieldLabel>
          <FieldDescription>
            切换此选项可让项目与触发器对齐。
          </FieldDescription>
        </FieldContent>
        <Switch
          id="align-item"
          checked={alignItemWithTrigger}
          onCheckedChange={setAlignItemWithTrigger}
        />
      </Field>
      <Field>
        <Select items={items} defaultValue="banana">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={alignItemWithTrigger}>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}
