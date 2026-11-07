"use client"

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

export function DrawerSwipeHandle() {
  return (
    <Drawer showSwipeHandle>
      <DrawerTrigger render={<Button variant="secondary" />}>
        打开抽屉
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>抽屉</DrawerTitle>
          <DrawerDescription>带有滑动手柄的抽屉。</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 p-4">
          <div className="rounded-2xl bg-muted group-data-[swipe-axis=x]/drawer-popup:size-full group-data-[swipe-axis=y]/drawer-popup:h-80 group-data-[swipe-axis=y]/drawer-popup:w-full" />
        </div>
        <DrawerFooter>
          <DrawerClose render={<Button />}>关闭</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
