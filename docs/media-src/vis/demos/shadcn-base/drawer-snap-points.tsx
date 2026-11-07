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

const SNAP_POINTS = ["31rem", 1]

export function DrawerSnapPoints() {
  return (
    <Drawer snapPoints={SNAP_POINTS} showSwipeHandle>
      <DrawerTrigger render={<Button variant="outline" />}>
        打开吸附抽屉
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>吸附位置</DrawerTitle>
          <DrawerDescription>
            拖动抽屉，可在紧凑预览和接近全高的视图之间吸附切换。
          </DrawerDescription>
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
