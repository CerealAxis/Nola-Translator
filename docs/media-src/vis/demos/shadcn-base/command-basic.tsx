"use client"

import * as React from "react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/styles/base-nova/ui/command"

export function CommandBasic() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setOpen(true)} variant="outline" className="w-fit">
        打开菜单
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="输入命令或搜索..." />
          <CommandList>
            <CommandEmpty>未找到结果。</CommandEmpty>
            <CommandGroup heading="建议">
              <CommandItem>日历</CommandItem>
              <CommandItem>搜索表情</CommandItem>
              <CommandItem>计算器</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
