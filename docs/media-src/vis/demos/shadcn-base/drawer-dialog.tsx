"use client"

import * as React from "react"
import { cn } from "cn"

import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-rhea/ui/dialog"
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
import { Input } from "@/styles/base-rhea/ui/input"
import { Label } from "@/styles/base-rhea/ui/label"

export function DrawerDialogDemo() {
  const [open, setOpen] = React.useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" />}>
          编辑个人资料
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>编辑个人资料</DialogTitle>
            <DialogDescription>
              在此修改个人资料。完成后点击保存。
            </DialogDescription>
          </DialogHeader>
          <ProfileForm />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={<Button variant="outline" />}>
        编辑个人资料
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>编辑个人资料</DrawerTitle>
          <DrawerDescription>
            在此修改个人资料。完成后点击保存。
          </DrawerDescription>
        </DrawerHeader>
        <ProfileForm className="p-4" />
      </DrawerContent>
    </Drawer>
  )
}

function ProfileForm({ className }: React.ComponentProps<"form">) {
  return (
    <form className={cn("grid items-start gap-6", className)}>
      <div className="grid gap-3">
        <Label htmlFor="email">邮箱</Label>
        <Input type="email" id="email" defaultValue="shadcn@example.com" />
      </div>
      <div className="grid gap-3">
        <Label htmlFor="username">用户名</Label>
        <Input id="username" defaultValue="@shadcn" />
      </div>
      <Button type="submit">保存更改</Button>
    </form>
  )
}
