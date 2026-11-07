"use client"

import * as React from "react"
import { toast } from "sonner"

import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/styles/base-rhea/ui/badge"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/styles/base-rhea/ui/drawer"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/styles/base-rhea/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-rhea/ui/radio-group"

const deliveryTimes = [
  {
    value: "asap",
    id: "delivery-asap",
    label: "标准配送",
    description: "预计 25–35 分钟 · 已分配司机",
    badge: "最快",
  },
  {
    value: "5-00",
    id: "delivery-5-00",
    label: "5:00 PM – 5:15 PM",
    description: "预计下午 4:45 开始准备",
  },
  {
    value: "5-30",
    id: "delivery-5-30",
    label: "5:30 PM – 5:45 PM",
    description: "适合正在回家路上的你",
  },
  {
    value: "6-00",
    id: "delivery-6-00",
    label: "6:00 PM – 6:15 PM",
    description: "最受欢迎 · 需求较高",
  },
  {
    value: "6-30",
    id: "delivery-6-30",
    label: "6:30 PM – 6:45 PM",
    description: "厨房打烊前的最后时段",
  },
]

export function DrawerDemo() {
  const [open, setOpen] = React.useState(false)
  const [deliveryTime, setDeliveryTime] = React.useState("asap")
  const isMobile = useIsMobile()

  function handleConfirm() {
    const selected = deliveryTimes.find((time) => time.value === deliveryTime)

    if (!selected) {
      return
    }

    setOpen(false)
    toast("配送时间已确认", {
      description: selected.label,
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      showSwipeHandle={isMobile}
      swipeDirection={isMobile ? "down" : "right"}
    >
      <DrawerTrigger render={<Button variant="secondary" />}>
        打开抽屉
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>选择送达时间</DrawerTitle>
          <DrawerDescription>
            我们会尽快准备你的订单。
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 scroll-fade overflow-y-auto p-4">
          <RadioGroup
            value={deliveryTime}
            onValueChange={setDeliveryTime}
            className="gap-2"
          >
            {deliveryTimes.map((time) => (
              <FieldLabel key={time.value} htmlFor={time.id}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle className="flex items-center gap-2">
                      {time.label}
                      {time.badge ? (
                        <Badge variant="secondary">{time.badge}</Badge>
                      ) : null}
                    </FieldTitle>
                    <FieldDescription>{time.description}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem value={time.value} id={time.id} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </div>
        <DrawerFooter>
          <Button onClick={handleConfirm} className="h-[34px]">
            确认送达时间
          </Button>
          <DrawerClose render={<Button variant="outline" />}>
            取消
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
