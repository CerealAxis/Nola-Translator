"use client"

import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ShareIcon,
  TrashIcon,
  UserRoundXIcon,
  VolumeOffIcon,
} from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/styles/base-nova/ui/dropdown-menu"

export default function ButtonGroupDropdown() {
  return (
    <ButtonGroup>
      <Button variant="outline">关注</Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="pl-2!" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <VolumeOffIcon />
              将对话静音
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CheckIcon />
              标记为已读
            </DropdownMenuItem>
            <DropdownMenuItem>
              <AlertTriangleIcon />
              举报对话
            </DropdownMenuItem>
            <DropdownMenuItem>
              <UserRoundXIcon />
              屏蔽用户
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ShareIcon />
              分享对话
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CopyIcon />
              复制对话
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">
              <TrashIcon />
              删除对话
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
