"use client"

import * as React from "react"

import { Button } from "@/styles/base-nova/ui/button"
import { Calendar } from "@/styles/base-nova/ui/calendar"
import { Field, FieldLabel } from "@/styles/base-nova/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"

export function DatePickerSimple() {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(undefined)

  return (
    <Field className="mx-auto w-44">
      <FieldLabel htmlFor="date">出生日期</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              id="date"
              className="justify-start font-normal"
            />
          }
        >
          {date ? date.toLocaleDateString() : "选择日期"}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            onSelect={(date) => {
              setDate(date)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
