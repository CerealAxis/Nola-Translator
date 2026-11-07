"use client"

import { PencilIcon, ShareIcon, TrashIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/styles/base-nova/ui/dropdown-menu"

export function DropdownMenuDestructive() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        操作
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <PencilIcon />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ShareIcon />
            分享
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive">
            <TrashIcon />
            删除
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
