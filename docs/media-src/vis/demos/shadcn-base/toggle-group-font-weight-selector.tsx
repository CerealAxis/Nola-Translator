"use client"

import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

export function ToggleGroupFontWeightSelector() {
  const [fontWeight, setFontWeight] = React.useState("normal")
  return (
    <Field>
      <FieldLabel>字重</FieldLabel>
      <ToggleGroup
        value={[fontWeight]}
        onValueChange={(value) => setFontWeight(value[0])}
        variant="outline"
        spacing={2}
        size="lg"
      >
        <ToggleGroupItem
          value="light"
          aria-label="浅色"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-light">Aa</span>
          <span className="text-xs text-muted-foreground">浅色</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="normal"
          aria-label="标准"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-normal">Aa</span>
          <span className="text-xs text-muted-foreground">标准</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="medium"
          aria-label="中"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-medium">Aa</span>
          <span className="text-xs text-muted-foreground">中</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="bold"
          aria-label="加粗"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-bold">Aa</span>
          <span className="text-xs text-muted-foreground">加粗</span>
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>
        使用{" "}
        <code className="rounded-md bg-muted px-1 py-0.5 font-mono">
          font-{fontWeight}
        </code>{" "}
        以设置字重。
      </FieldDescription>
    </Field>
  )
}
