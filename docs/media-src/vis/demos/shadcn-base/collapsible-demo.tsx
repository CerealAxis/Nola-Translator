"use client"

import * as React from "react"
import { ChevronsUpDown } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/styles/base-nova/ui/collapsible"

export default function CollapsibleDemo() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="flex w-[350px] flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-4 px-4">
        <h4 className="text-sm font-semibold">订单 #4189</h4>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon" className="size-8" />}
        >
          <ChevronsUpDown />
          <span className="sr-only">展开详情</span>
        </CollapsibleTrigger>
      </div>
      <div className="flex items-center justify-between rounded-md border px-4 py-2 text-sm">
        <span className="text-muted-foreground">状态</span>
        <span className="font-medium">已发货</span>
      </div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-4 py-2 text-sm">
          <p className="font-medium">收货地址</p>
          <p className="text-muted-foreground">旧金山市场街 100 号</p>
        </div>
        <div className="rounded-md border px-4 py-2 text-sm">
          <p className="font-medium">项目</p>
          <p className="text-muted-foreground">2 副录音室耳机</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
