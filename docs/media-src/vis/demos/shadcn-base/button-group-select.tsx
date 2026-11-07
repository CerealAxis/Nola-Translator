"use client"

import * as React from "react"
import { ArrowRightIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import { Input } from "@/styles/base-nova/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/styles/base-nova/ui/select"

const CURRENCIES = [
  { label: "美元", value: "$" },
  { label: "欧元", value: "€" },
  { label: "英镑", value: "£" },
]

export default function ButtonGroupSelect() {
  const [currency, setCurrency] = React.useState("$")

  return (
    <ButtonGroup>
      <ButtonGroup>
        <Select
          items={CURRENCIES}
          value={currency}
          onValueChange={(value) => setCurrency(value as string)}
        >
          <SelectTrigger className="font-mono">{currency}</SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            <SelectGroup>
              {CURRENCIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.value}{" "}
                  <span className="text-muted-foreground">{item.label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input placeholder="10.00" pattern="[0-9]*" />
      </ButtonGroup>
      <ButtonGroup>
        <Button aria-label="发送" size="icon" variant="outline">
          <ArrowRightIcon />
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  )
}
