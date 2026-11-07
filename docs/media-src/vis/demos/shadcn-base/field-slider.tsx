"use client"

import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldTitle,
} from "@/styles/base-nova/ui/field"
import { Slider } from "@/styles/base-nova/ui/slider"

export default function FieldSlider() {
  const [value, setValue] = React.useState([200, 800])

  return (
    <Field className="w-full max-w-xs">
      <FieldTitle>价格范围</FieldTitle>
      <FieldDescription>
        设置预算范围（$
        <span className="font-medium tabular-nums">{value[0]}</span> -{" "}
        <span className="font-medium tabular-nums">{value[1]}</span>).
      </FieldDescription>
      <Slider
        value={value}
        onValueChange={(value) => setValue(value as [number, number])}
        max={1000}
        min={0}
        step={10}
        className="mt-2 w-full"
        aria-label="价格范围"
      />
    </Field>
  )
}
