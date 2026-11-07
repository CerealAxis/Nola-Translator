"use client"

import * as React from "react"
import {
  BellIcon,
  CalculatorIcon,
  CalendarIcon,
  ClipboardPasteIcon,
  CodeIcon,
  CopyIcon,
  CreditCardIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  HelpCircleIcon,
  HomeIcon,
  ImageIcon,
  InboxIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  ScissorsIcon,
  SettingsIcon,
  TrashIcon,
  UserIcon,
  ZoomInIcon,
  ZoomOutIcon,
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

export function CommandManyItems() {
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
            <CommandGroup heading="导航">
              <CommandItem>
                <HomeIcon />
                <span>首页</span>
                <CommandShortcut>⌘H</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <InboxIcon />
                <span>收件箱</span>
                <CommandShortcut>⌘I</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <FileTextIcon />
                <span>文档</span>
                <CommandShortcut>⌘D</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <FolderIcon />
                <span>文件夹</span>
                <CommandShortcut>⌘F</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="操作">
              <CommandItem>
                <PlusIcon />
                <span>新建文件</span>
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <FolderPlusIcon />
                <span>新建文件夹</span>
                <CommandShortcut>⇧⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CopyIcon />
                <span>复制</span>
                <CommandShortcut>⌘C</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <ScissorsIcon />
                <span>剪切</span>
                <CommandShortcut>⌘X</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <ClipboardPasteIcon />
                <span>粘贴</span>
                <CommandShortcut>⌘V</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <TrashIcon />
                <span>删除</span>
                <CommandShortcut>⌫</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="视图">
              <CommandItem>
                <LayoutGridIcon />
                <span>网格视图</span>
              </CommandItem>
              <CommandItem>
                <ListIcon />
                <span>列表视图</span>
              </CommandItem>
              <CommandItem>
                <ZoomInIcon />
                <span>放大</span>
                <CommandShortcut>⌘+</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <ZoomOutIcon />
                <span>缩小</span>
                <CommandShortcut>⌘-</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="账户">
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
              <CommandItem>
                <BellIcon />
                <span>通知</span>
              </CommandItem>
              <CommandItem>
                <HelpCircleIcon />
                <span>帮助与支持</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="工具">
              <CommandItem>
                <CalculatorIcon />
                <span>计算器</span>
              </CommandItem>
              <CommandItem>
                <CalendarIcon />
                <span>日历</span>
              </CommandItem>
              <CommandItem>
                <ImageIcon />
                <span>图像编辑器</span>
              </CommandItem>
              <CommandItem>
                <CodeIcon />
                <span>代码编辑器</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
