"use client"

import * as React from "react"
import {
  CalculatorIcon,
  CalendarIcon,
  CreditCardIcon,
  SettingsIcon,
  SmileIcon,
  UserIcon,
} from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/styles/base-nova/ui/command"

export function CommandWithGroups() {
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
              <CommandItem>
                <CalendarIcon />
                <span>日历</span>
              </CommandItem>
              <CommandItem>
                <SmileIcon />
                <span>搜索表情</span>
              </CommandItem>
              <CommandItem>
                <CalculatorIcon />
                <span>计算器</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="设置">
              <CommandItem>
                <UserIcon />
                <span>个人资料</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CreditCardIcon />
                <span>账单</span>
                <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <SettingsIcon />
                <span>设置</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
