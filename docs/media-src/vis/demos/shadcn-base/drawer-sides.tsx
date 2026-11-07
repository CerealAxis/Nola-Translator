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

export function DrawerWithSides() {
  return (
    <Drawer swipeDirection="left">
      <DrawerTrigger render={<Button variant="secondary" />}>
        打开左侧抽屉
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>设置目标</DrawerTitle>
          <DrawerDescription>设置每日活动目标。</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 p-4">
          <div className="size-full rounded-2xl bg-muted" />
        </div>
        <DrawerFooter>
          <DrawerClose render={<Button />}>关闭</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
