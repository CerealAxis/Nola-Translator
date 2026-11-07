import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
} from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/styles/base-nova/ui/command"

export function CommandDemo() {
  return (
    <Command className="max-w-sm rounded-lg border">
      <CommandInput placeholder="输入命令或搜索..." />
      <CommandList>
        <CommandEmpty>未找到结果。</CommandEmpty>
        <CommandGroup heading="建议">
          <CommandItem>
            <Calendar />
            <span>日历</span>
          </CommandItem>
          <CommandItem>
            <Smile />
            <span>搜索表情</span>
          </CommandItem>
          <CommandItem disabled>
            <Calculator />
            <span>计算器</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="设置">
          <CommandItem>
            <User />
            <span>个人资料</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CreditCard />
            <span>账单</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Settings />
            <span>设置</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
