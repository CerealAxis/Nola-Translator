"use client"

import * as React from "react"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarPlusIcon,
  ClockIcon,
  ListFilterIcon,
  MailCheckIcon,
  MoreHorizontalIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/styles/base-nova/ui/dropdown-menu"

export default function ButtonGroupDemo() {
  const [label, setLabel] = React.useState("personal")

  return (
    <ButtonGroup>
      <ButtonGroup className="hidden sm:flex">
        <Button variant="outline" size="icon" aria-label="返回">
          <ArrowLeftIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">归档</Button>
        <Button variant="outline">举报</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">稍后提醒</Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon" aria-label="更多选项" />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <MailCheckIcon />
                标记为已读
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ArchiveIcon />
                归档
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <ClockIcon />
                稍后提醒
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CalendarPlusIcon />
                添加到日历
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ListFilterIcon />
                添加到列表
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <TagIcon />
                  标记为...
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={label}
                    onValueChange={setLabel}
                  >
                    <DropdownMenuRadioItem value="personal">
                      个人
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="work">
                      工作
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="other">
                      其他
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">
                <Trash2Icon />
                废纸篓
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </ButtonGroup>
  )
}
